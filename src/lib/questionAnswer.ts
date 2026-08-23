/**
 * Auto-answer JobStreet screening questions.
 *
 * Handles the mixed CSV format seen in practice:
 *   - old rows:  url, question, optionsRaw               (3 columns)
 *   - new rows:  url, question, type, optionsRaw          (4 columns)
 *     where type is "dropdown" | "radiobutton" | "checklist".
 *     "checklist" means multiple options can be selected at once —
 *     everything else is single-select.
 *
 * Strategy (unchanged from v1, just extended):
 *   1. Regex/keyword classification first — free, instant, predictable.
 *   2. Anything unclassified falls back to the Claude API, which is told
 *      whether it may pick one option or several (based on `type`).
 *
 * Run with: npx tsx answer-screening-questions-v2.ts input.csv
 * (needs: npm install csv-parse @google/generative-ai tsx)
 * Set GEMINI_API_KEY in your environment before running.
 */

import { parse } from "csv-parse/sync";
import { readFileSync, writeFileSync } from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ---------------------------------------------------------------------------
// 1. YOUR PROFILE — edit these to match your actual situation
// ---------------------------------------------------------------------------

const PROFILE = {
  expectedMonthlySalaryIDR: 8_000_000,
  educationLevel: "Sarjana (S1)" as const, // must match option wording (ID or EN, both handled below)

  experienceByRole: [
    { keywords: ["full stack", "fullstack"], years: 3 },
    { keywords: ["backend"], years: 3 },
    { keywords: ["java developer", "java"], years: 2 },
    { keywords: ["postgresql", "postgres"], years: 2 },
    { keywords: ["web developer"], years: 3 },
    { keywords: ["software development", "programmer"], years: 3 },
    { keywords: ["sales", "marketing"], years: 0 },
  ],
  defaultExperienceYears: 1,

  // Right-to-work status. Must match option wording exactly (script tries
  // both Indonesian and English phrasing below).
  workRights: {
    id: "Saya adalah warga negara Indonesia",
    en: "I'm an Indonesian citizen",
  },

  // Resume selection: a substring that identifies your preferred resume
  // file among the options (e.g. filename minus extension quirks).
  preferredResumeHint: "Full Stack Developer - Glints TapLoker",
  // Fallback if no file option matches the hint above:
  resumeFallback: "Don't include a resumé",

  coverLetterPreference: "Don't include a cover letter",

  // For "Make this my default resumé" style single-checkbox questions.
  wantDefaultResume: true,

  // Tools/technologies you have experience with, for multi-select
  // "which of these have you used" checklist questions. Matching is
  // case-insensitive substring match against each option.
  knownTools: ["git", "svn", "subversion"],
};

// ---------------------------------------------------------------------------
// 2. Types
// ---------------------------------------------------------------------------

type QuestionType = "dropdown" | "radiobutton" | "checklist" | "unknown";

interface Row {
  url: string;
  question: string;
  type: QuestionType;
  optionsRaw: string;
}

interface AnsweredRow extends Row {
  options: string[];
  answers: string[]; // one item unless type === "checklist"
  source: "regex" | "llm" | "unmatched";
}

// ---------------------------------------------------------------------------
// 3. CSV loading — tolerates both 3-column and 4-column rows
// ---------------------------------------------------------------------------

function loadRows(csvPath: string): Row[] {
  const raw = readFileSync(csvPath, "utf-8");
  const records: string[][] = parse(raw, {
    columns: false,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  return records.map((cols) => {
    if (cols.length >= 4) {
      const [url, question, type, optionsRaw] = cols;
      const normalizedType: QuestionType =
        type === "dropdown" || type === "radiobutton" || type === "checklist"
          ? type
          : "unknown";
      return { url, question, type: normalizedType, optionsRaw };
    }
    // old 3-column format: no type column, assume single-select
    const [url, question, optionsRaw] = cols;
    return { url, question, type: "unknown" as QuestionType, optionsRaw };
  });
}

function splitOptions(optionsRaw: string): string[] {
  return optionsRaw
    .split("|")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

// ---------------------------------------------------------------------------
// 4. Regex-based matching (fast path, no API call)
// ---------------------------------------------------------------------------

function parseSalaryOption(opt: string): number | null {
  const match = opt.match(/Rp\s*([\d.,]+)\s*(Jt|million)?/i);
  if (!match) return null;
  const num = parseFloat(match[1].replace(",", "."));
  if (isNaN(num)) return null;
  return num * 1_000_000;
}

function closestSalaryOption(options: string[], target: number): string {
  let best = options[0];
  let bestDiff = Infinity;
  for (const opt of options) {
    const val = parseSalaryOption(opt);
    if (val === null) continue;
    const diff = Math.abs(val - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = opt;
    }
  }
  return best;
}

function closestExperienceOption(options: string[], years: number): string {
  const parseYears = (opt: string): number | null => {
    const lower = opt.toLowerCase();
    if (/no experience|tidak ada pengalaman/.test(lower)) return 0;
    if (/less than 1|kurang dari 1/.test(lower)) return 0.5;
    if (/more than 5|lebih dari 5/.test(lower)) return 6;
    const m = lower.match(/(\d+)\s*(year|tahun)/);
    return m ? parseInt(m[1], 10) : null;
  };
  let best = options[0];
  let bestDiff = Infinity;
  for (const opt of options) {
    const val = parseYears(opt);
    if (val === null) continue;
    const diff = Math.abs(val - years);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = opt;
    }
  }
  return best;
}

function yearsForRole(question: string): number {
  const lower = question.toLowerCase();
  for (const entry of PROFILE.experienceByRole) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry.years;
    }
  }
  return PROFILE.defaultExperienceYears;
}

/**
 * Loose keyword-based classification. Returns one or more chosen options,
 * or null if nothing matched (caller falls back to the LLM).
 */
function tryRegexAnswer(
  question: string,
  options: string[],
  type: QuestionType
): string[] | null {
  const q = question.toLowerCase();

  if (/salary|gaji/.test(q)) {
    return [closestSalaryOption(options, PROFILE.expectedMonthlySalaryIDR)];
  }

  if (/qualification|kualifikasi/.test(q)) {
    const match = options.find((o) =>
      o.toLowerCase().includes(PROFILE.educationLevel.toLowerCase())
    );
    return match ? [match] : null;
  }

  if (/years'? experience|tahun pengalaman/.test(q)) {
    return [closestExperienceOption(options, yearsForRole(question))];
  }

  if (/right to work|hak.*bekerja/.test(q)) {
    const match = options.find(
      (o) => o.includes(PROFILE.workRights.id) || o.includes(PROFILE.workRights.en)
    );
    return match ? [match] : null;
  }

  // Cover letter question: options mention "cover letter" but question
  // text itself is often generic ("Select one option").
  if (options.some((o) => /cover letter|surat lamaran/i.test(o))) {
    const match = options.find((o) => o === PROFILE.coverLetterPreference);
    return match ? [match] : [options[options.length - 1]]; // last option is usually "don't include"
  }

  // Resume file selection: options look like filenames (.pdf) plus a
  // "don't include" choice.
  if (options.some((o) => /\.pdf$/i.test(o))) {
    const match = options.find((o) =>
      o.toLowerCase().includes(PROFILE.preferredResumeHint.toLowerCase())
    );
    return match ? [match] : [PROFILE.resumeFallback];
  }

  // "Make this my default resumé" style single checkbox (checklist with
  // exactly one option).
  if (
    type === "checklist" &&
    options.length === 1 &&
    /default resum/i.test(options[0])
  ) {
    return PROFILE.wantDefaultResume ? [options[0]] : [];
  }

  // Tools/technology checklist (multi-select)
  if (type === "checklist" && /revision control|tools|technolog/i.test(q)) {
    const matches = options.filter((o) =>
      PROFILE.knownTools.some((tool) => o.toLowerCase().includes(tool))
    );
    return matches.length > 0 ? matches : [options[options.length - 1]]; // "None of these" is usually last
  }

  return null;
}

// ---------------------------------------------------------------------------
// 5. LLM fallback for anything regex couldn't classify
// ---------------------------------------------------------------------------

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

async function askLLM(
  question: string,
  options: string[],
  type: QuestionType
): Promise<string[]> {
  const multiSelect = type === "checklist";

  const prompt = `You are filling out a job application screening question on behalf of a candidate.

Candidate profile:
- Expected monthly salary: Rp ${PROFILE.expectedMonthlySalaryIDR.toLocaleString("id-ID")}
- Education: ${PROFILE.educationLevel}
- Experience: ${PROFILE.experienceByRole
    .map((e) => `${e.keywords[0]}: ${e.years} years`)
    .join(", ")}; default ${PROFILE.defaultExperienceYears} years for anything else.
- Right to work: ${PROFILE.workRights.en}
- Known tools: ${PROFILE.knownTools.join(", ")}

Question: "${question}"
Question type: ${type} (${multiSelect ? "you may choose MULTIPLE options" : "choose exactly ONE option"})
Allowed options (copy chosen ones verbatim): ${options.map((o) => `"${o}"`).join(" | ")}

Reply with ONLY the chosen option(s), copied exactly from the list. If choosing multiple, separate them with " || ". Nothing else.`;

  const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent(prompt);
  const text = (result.response.text() || "").trim();

  const picked = text.split("||").map((s: string) => s.trim());
  const valid = picked.filter((p: string) => options.includes(p));
  return valid.length > 0 ? valid : [options[0]];
}

// ---------------------------------------------------------------------------
// 6. Main pipeline
// ---------------------------------------------------------------------------

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: npx tsx answer-screening-questions-v2.ts <input.csv>");
    process.exit(1);
  }

  const rows = loadRows(inputPath);
  const results: AnsweredRow[] = [];

  for (const row of rows) {
    const options = splitOptions(row.optionsRaw);
    const regexAnswer = tryRegexAnswer(row.question, options, row.type);

    if (regexAnswer !== null) {
      results.push({ ...row, options, answers: regexAnswer, source: "regex" });
      continue;
    }

    try {
      const llmAnswer = await askLLM(row.question, options, row.type);
      results.push({ ...row, options, answers: llmAnswer, source: "llm" });
    } catch (err) {
      console.error(`LLM call failed for "${row.question}":`, err);
      results.push({ ...row, options, answers: [], source: "unmatched" });
    }
  }

  const regexCount = results.filter((r) => r.source === "regex").length;
  const llmCount = results.filter((r) => r.source === "llm").length;
  const unmatchedCount = results.filter((r) => r.source === "unmatched").length;
  console.log(
    `Done: ${results.length} questions -> ${regexCount} via regex, ${llmCount} via LLM, ${unmatchedCount} unmatched`
  );

  const outPath = inputPath.replace(/\.csv$/, "") + "-answered.csv";
  const csvLines = results.map((r) => {
    const answerStr = r.answers.join(" || ").replace(/"/g, '""');
    return `"${r.url}","${r.question.replace(/"/g, '""')}","${r.type}","${answerStr}","${r.source}"`;
  });
  writeFileSync(outPath, csvLines.join("\n"), "utf-8");
  console.log(`Written to ${outPath}`);
}

// Export answerQuestion for bot integration
export async function answerQuestion(
  question: string,
  options: string[],
  type: "dropdown" | "checklist" | "radiobutton"
): Promise<string[]> {
  try {
    const normType = type as QuestionType;
    const regexAnswer = tryRegexAnswer(question, options, normType);
    if (regexAnswer !== null) {
      return regexAnswer;
    }
    return await askLLM(question, options, normType);
  } catch (err) {
    console.error(`AI failed to answer "${question}":`, err);
    return [options[0]]; // fallback to first option
  }
}

// Only run main if executed directly
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  main().catch(console.error);
}