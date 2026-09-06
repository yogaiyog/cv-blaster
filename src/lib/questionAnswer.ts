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
import fs, { readFileSync, writeFileSync } from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { AppConfig, getConfig } from "./config";
import { getQuestionsFromSheet, ScreeningQuestionItem } from "./googleSheets";

const defaultSkills = [
  "JavaScript", "TypeScript", "Python", "Java", "C#", "C++", "PHP", "Go", "HTML", "CSS",
  "React", "React.js", "Next.js", "Angular", "Angular.js", "Tailwind CSS", "Bootstrap", "jQuery",
  "Framer Motion", "Three.js", "React Three Fiber", "Drei", "Node.js", "Express.js", "Fiber", "GORM",
  "REST API", "RESTful API", "Redis", "RabbitMQ", "Celery", "Asynq", "message queue", "kafka",
  "PostgreSQL", "MySQL", "Supabase", "Prisma", "SQL", "Docker", "Nginx", "PM2", "Git", "GitHub",
  "GitHub Actions", "Cloudflare", "Let's Encrypt", "Certbot", "CI/CD", "Postman", "VS Code",
  "Full Stack Development", "Backend Development", "Frontend Development", "Web Development",
  "API Development", "Database Design", "Microservices", "Object-Oriented Programming",
  "Asynchronous Programming", "Blender", "TouchDesigner", "MediaPipe", "figma", "clickup", "jira",
  "trello", "slack", "notion", "Agile", "Scrum", "Problem Solving", "Debugging"
];

export function getDynamicProfile(customConfig?: AppConfig) {
  try {
    const cfg = customConfig || getConfig();
    return {
      expectedMonthlySalaryIDR: Number(cfg.expectedSalary) || 8_000_000,
      educationLevel: cfg.educationLevel || "Sarjana (S1)",
      gpa: cfg.gpa || "3.75",
      defaultExperienceYears: Number(cfg.yearsOfExperience) || 3,
      experienceByRole: [
        { keywords: ["full stack", "fullstack"], years: Number(cfg.yearsOfExperience) || 3 },
        { keywords: ["backend"], years: Number(cfg.yearsOfExperience) || 3 },
        { keywords: ["java developer", "java"], years: 2 },
        { keywords: ["postgresql", "postgres"], years: 2 },
        { keywords: ["web developer"], years: Number(cfg.yearsOfExperience) || 3 },
        { keywords: ["software development", "programmer"], years: Number(cfg.yearsOfExperience) || 3 },
        { keywords: ["sales", "marketing"], years: 0 },
      ],
      workRights: {
        id: "Saya adalah warga negara Indonesia",
        en: "I'm an Indonesian citizen",
      },
      preferredResumeHint: "Full Stack Developer - Glints TapLoker",
      resumeFallback: "Don't include a resumé",
      coverLetterPreference: "Don't include a cover letter",
      wantDefaultResume: true,
      knownTools: ["git", "svn", "subversion"],
      portfolio: cfg.portfolioUrl || "https://github.com/yogaadi",
      github: cfg.githubUrl || "https://github.com/yogaadi",
      linkedin: cfg.linkedinUrl || "https://www.linkedin.com",
      noticePeriod: cfg.noticePeriod || "Immediately",
    };
  } catch {
    return {
      expectedMonthlySalaryIDR: 8_000_000,
      educationLevel: "Sarjana (S1)",
      gpa: "3.75",
      defaultExperienceYears: 3,
      experienceByRole: [
        { keywords: ["full stack", "fullstack"], years: 3 },
        { keywords: ["backend"], years: 3 },
        { keywords: ["web developer"], years: 3 },
      ],
      workRights: {
        id: "Saya adalah warga negara Indonesia",
        en: "I'm an Indonesian citizen",
      },
      preferredResumeHint: "Full Stack Developer",
      resumeFallback: "Don't include a resumé",
      coverLetterPreference: "Don't include a cover letter",
      wantDefaultResume: true,
      knownTools: ["git"],
      portfolio: "https://github.com/yogaadi",
      github: "https://github.com/yogaadi",
      linkedin: "https://www.linkedin.com",
      noticePeriod: "Immediately",
    };
  }
}

export function getDynamicSkills(customConfig?: AppConfig): string[] {
  try {
    const cfg = customConfig || getConfig();
    if (cfg.skills && cfg.skills.trim().length > 0) {
      const userSkills = cfg.skills.split(',').map(s => s.trim()).filter(s => s.length > 0);
      return Array.from(new Set([...userSkills, ...defaultSkills]));
    }
  } catch {}
  return defaultSkills;
}

// ---------------------------------------------------------------------------
// 2. Types
// ---------------------------------------------------------------------------

type QuestionType = "dropdown" | "radiobutton" | "checklist" | "text" | "unknown";

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
    const lower = opt.toLowerCase().trim();
    if (/no experience|tidak berpengalaman|tidak ada pengalaman/i.test(lower)) return 0;
    if (/<1|< 1|less than 1|kurang dari 1/i.test(lower)) return 0.5;
    if (/10\+|more than 10|lebih dari 10/i.test(lower)) return 10;
    if (/5\s*-\s*10/i.test(lower)) return 7.5;
    if (/3\s*-\s*5/i.test(lower)) return 4;
    if (/1\s*-\s*3/i.test(lower)) return 2;
    if (/more than 5|lebih dari 5/i.test(lower)) return 6;
    const rangeMatch = lower.match(/(\d+)\s*-\s*(\d+)/);
    if (rangeMatch) {
      return (parseInt(rangeMatch[1], 10) + parseInt(rangeMatch[2], 10)) / 2;
    }
    const m = lower.match(/(\d+)\s*(thn|tahun|yr|yrs|year|years)?/);
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

function yearsForRole(question: string, customConfig?: AppConfig): number {
  const cfg = customConfig || getConfig();
  const profile = getDynamicProfile(cfg);
  const defaultYrs = Number(cfg.yearsOfExperience) || profile.defaultExperienceYears || 3;
  const lower = question.toLowerCase();

  // 1. Cek specific role keywords
  for (const entry of profile.experienceByRole) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry.years;
    }
  }

  // 2. Pertanyaan tentang QA, testing, automation, development, IT, software
  if (/software|qa|quality|testing|test|automation|developer|programmer|engineer|it|tech|lead|frontend|backend|fullstack|web|data|system/i.test(lower)) {
    return defaultYrs;
  }

  return defaultYrs;
}

// ---------------------------------------------------------------------------
// 4. Deterministic rules (instant, 0 tokens)
// ---------------------------------------------------------------------------

function tryRegexAnswer(
  question: string,
  options: string[],
  type: QuestionType,
  customConfig?: AppConfig
): string[] | null {
  const cfg = customConfig || getConfig();
  const q = question.toLowerCase();
  const profile = getDynamicProfile(cfg);
  const dynamicSkills = getDynamicSkills(cfg);

  const fullName = (cfg.fullName || "Yoga Adi Saputra").trim();
  const nameParts = fullName.split(/\s+/);
  const firstName = nameParts[0] || "Yoga";
  const lastName = nameParts.slice(1).join(" ") || "Adi Saputra";

  // 1. Profil Pribadi: First Name, Last Name, Full Name
  if (/^(?:first\s*name|given\s*name|nama\s*depan)(\s*\*|\s*:)?$/i.test(q) || /(?:first|given)\s*name|nama\s*depan/i.test(q)) {
    return [firstName];
  }

  if (/^(?:last\s*name|family\s*name|surname|nama\s*belakang)(\s*\*|\s*:)?$/i.test(q) || /(?:last|family|sur)\s*name|nama\s*belakang/i.test(q)) {
    return [lastName];
  }

  if (/^(?:full\s*name|nama\s*lengkap)(\s*\*|\s*:)?$/i.test(q)) {
    return [fullName];
  }

  // 2. Kontak: Nomor Telepon, Handphone, Mobile, WhatsApp
  if (/^(?:phone|telephone|mobile|handphone|nomor\s*hp|nomor\s*telepon|nomor\s*wa|whatsapp|telp)(\s*\*|\s*:)?$/i.test(q) || /\b(phone|mobile|telepon|handphone|hp)\b/i.test(q)) {
    return [cfg.phoneNumber || "081234567890"];
  }

  // 3. Email
  if (/^(?:email|surel|alamat\s*email|e-mail)(\s*\*|\s*:)?$/i.test(q)) {
    return ["yogaadi0902@gmail.com"];
  }

  // 4. Umur / Usia / Age
  if (/^(?:age|umur|usia)(\s*\*|\s*:)?$/i.test(q) || /\b(umur|usia)\b|^age$/i.test(q)) {
    return ["24"];
  }

  // 5. Negara / Country / Kewarganegaraan
  if (/^(?:country|negara|nationality|kewarganegaraan)(\s*\*|\s*:)?$/i.test(q) || /country|negara/i.test(q)) {
    if (options.length > 0) {
      const match = options.find(o => /^(indonesia|indonesian|wni)$/i.test(o.trim())) || options.find(o => /indonesia/i.test(o));
      if (match) return [match];
    }
    return ["Indonesia"];
  }

  // 6. Kota / Lokasi / Alamat / Kode Pos
  if (/^(?:city|kota|kabupaten|lokasi|domisili)(\s*\*|\s*:)?$/i.test(q)) {
    if (options.length > 0) {
      const match = options.find(o => /jakarta/i.test(o));
      if (match) return [match];
    }
    return [cfg.location || cfg.domicile || "Jakarta"];
  }

  if (/(?:street\s*address|address|alamat|street|domisili)/i.test(q)) {
    return [cfg.domicile || "Jakarta Selatan, DKI Jakarta"];
  }

  if (/^(?:postal\s*code|zip\s*code|kode\s*pos)(\s*\*|\s*:)?$/i.test(q)) {
    return ["12190"];
  }

  // 7. Pemilihan Resume / CV (Indeed / Glints / JobStreet)
  if (options.some(o => /resume|cv|\.pdf/i.test(o))) {
    const indeedResumeMatch = options.find(o => /use your indeed resume|indeed resume/i.test(o));
    if (indeedResumeMatch) return [indeedResumeMatch];

    const pdfCandidateMatch = options.find(o => /yoga|ats_cv|\.pdf/i.test(o) && !/don't include|tidak sertakan/i.test(o));
    if (pdfCandidateMatch) return [pdfCandidateMatch];

    const anyValidResume = options.find(o => !/don't include|tidak sertakan|batal/i.test(o));
    if (anyValidResume) return [anyValidResume];
  }

  // 8. Gender / Jenis Kelamin
  if (/gender|jenis\s*kelamin/i.test(q)) {
    if (options.length > 0) {
      const match = options.find(o => /laki-laki|male|pria/i.test(o));
      if (match) return [match];
    }
    return ["Laki-laki"];
  }

  // 9. Status Pernikahan / Marital Status (e.g. Single, Belum Menikah)
  if (/marital|pernikahan|status\s*perkawinan|status\s*nikah/i.test(q) || options.some(o => /single|lajang|belum\s*menikah/i.test(o))) {
    if (options.length > 0) {
      const match = options.find(o => /^(single|lajang|belum\s*menikah)$/i.test(o.trim())) || options.find(o => /single|lajang|belum\s*menikah/i.test(o));
      if (match) return [match];
    }
    return ["Single"];
  }

  // 10. Pertanyaan Demografis / EEO / Keberagaman (Demographic, Disability, Veteran, Race, Consent)
  if (/demographic|ras|ethnicity|etnis|race|veteran|disability|disabilitas|difabel|sukarela|voluntary|declaration|persetujuan|consent/i.test(q)) {
    if (options.length > 0) {
      const declineMatch = options.find(o => /prefer not to say|decline|tidak ingin menjawab|rahasia|tidak berkenan/i.test(o));
      if (declineMatch) return [declineMatch];

      const noMatch = options.find(o => /^(no|tidak|i am not|saya bukan|tidak ada)$/i.test(o.trim())) || options.find(o => /tidak|no/i.test(o));
      if (noMatch) return [noMatch];

      const asianMatch = options.find(o => /asian|asia|indonesia/i.test(o));
      if (asianMatch) return [asianMatch];

      return [options[0]];
    }
    return ["Yes"];
  }

  // 11. Bahasa / English Language Skills
  if (/bahasa\s*inggris|english|bahasa|language/i.test(q)) {
    if (options.length > 0) {
      const match = options.find(o => /^(ya|yes|bisa|fluent|proficient|aktif|advanced)$/i.test(o.trim())) || options.find(o => /ya|yes|fluent|bisa/i.test(o));
      if (match) return [match];
    }
    return ["Ya"];
  }

  // 12. Tingkat Pendidikan Tertinggi (S1 / Sarjana / Bachelor)
  if (/tingkat\s*pendidikan|pendidikan\s*tertinggi|education\s*level|highest\s*education|kualifikasi\s*pendidikan/i.test(q)) {
    if (options.length > 0) {
      const s1Match = options.find(o => /^(s1|sarjana|bachelor|s1\s*\(sarjana\))$/i.test(o.trim())) || options.find(o => /s1|sarjana|bachelor/i.test(o));
      if (s1Match) return [s1Match];
      const generalMatch = options.find(o => o.toLowerCase().includes('s1') || o.toLowerCase().includes('sarjana') || o.toLowerCase().includes('bachelor'));
      if (generalMatch) return [generalMatch];
    }
    return ["S1"];
  }

  // 13. Open-ended Experience Questions (Playwright, Selenium, CI/CD, Automated Testing)
  if (/do you have experience|apakah anda memiliki pengalaman|apakah anda berpengalaman|do you have experince/i.test(q)) {
    if (options.length > 0) {
      const match = options.find(o => /^(ya|yes)$/i.test(o.trim())) || options.find(o => /ya|yes/i.test(o));
      if (match) return [match];
    }
    if (/playwright|selenium/i.test(q)) {
      return ["Yes, I have extensive experience using Playwright and Selenium for web automation and E2E testing."];
    }
    if (/ci\/cd|jenkins|github\s*actions|pipeline/i.test(q)) {
      return ["Yes, I have experience integrating automated testing suites into CI/CD pipelines using GitHub Actions and Jenkins."];
    }
    if (/testcomplete/i.test(q)) {
      return ["Yes, I have experience implementing automated testing frameworks and software quality assurance."];
    }
    return ["Yes, I have strong relevant experience in software development and testing."];
  }

  if (/salary|gaji/.test(q) && options.length > 0) {
    return [closestSalaryOption(options, profile.expectedMonthlySalaryIDR)];
  }

  if (/qualification|kualifikasi/.test(q)) {
    const match = options.find((o) =>
      o.toLowerCase().includes(profile.educationLevel.toLowerCase()) || /s1|sarjana/i.test(o)
    );
    return match ? [match] : ["S1"];
  }

  // Pertanyaan angka tahun pengalaman (hanya jika murni menanyakan durasi angka dan bukan deskripsi project/cerita)
  const isDescriptiveQ = /jelaskan|ceritakan|sebutkan|describe|explain|project|proyek|portfolio|contoh|apa saja|why|bagaimana|how did/i.test(q);

  if (!isDescriptiveQ) {
    if (/how many years|berapa tahun|years of (work )?experience|tahun pengalaman|years of experience/i.test(q)) {
      const yrs = yearsForRole(question);
      if (options.length > 0) {
        return [closestExperienceOption(options, yrs)];
      }
      return [String(yrs)];
    }

    if (options.some(o => /thn|tahun|berpengalaman/i.test(o)) && options.length > 0) {
      return [closestExperienceOption(options, yearsForRole(question))];
    }
  }

  if (/right to work|hak.*bekerja/.test(q)) {
    const match = options.find(
      (o) => o.includes(profile.workRights.id) || o.includes(profile.workRights.en)
    );
    return match ? [match] : null;
  }

  // Cover letter question: options mention "cover letter" but question
  // text itself is often generic ("Select one option").
  if (options.some((o) => /cover letter|surat lamaran/i.test(o))) {
    const match = options.find((o) => o === profile.coverLetterPreference);
    return match ? [match] : [options[options.length - 1]]; // last option is usually "don't include"
  }

  // Pertanyaan notice period / kapan bisa mulai bekerja (e.g. Kapan kamu dapat mulai bekerja? / Notice period)
  const isNoticePeriodQ = /mulai.*bekerja|notice.*period|start.*work|availability|kapan.*dapat|earliest.*start|ketersediaan|kapan.*bisa|join.*date|available.*to.*start|when.*start/i.test(q);
  const hasNoticePeriodOptions = options.some(o => /immediately|immediate|asap|as soon as possible|secepatnya|segera|langsung|2 weeks|1 month|2 months|2 minggu|1 bulan|2 bulan/i.test(o));

  if (isNoticePeriodQ || hasNoticePeriodOptions) {
    const pref = (profile.noticePeriod || "immediately").toLowerCase();

    if (/2\s*week|two\s*week|2\s*minggu|14\s*hari|14\s*days/i.test(pref)) {
      const match = options.find(o => /2\s*week|two\s*week|2\s*minggu|14\s*hari|14\s*days/i.test(o));
      if (match) return [match];
    } else if (/1\s*month|one\s*month|1\s*bulan|30\s*hari|30\s*days|4\s*week/i.test(pref)) {
      const match = options.find(o => /1\s*month|one\s*month|1\s*bulan|30\s*hari|30\s*days|4\s*week/i.test(o));
      if (match) return [match];
    } else if (/2\s*month|two\s*month|2\s*bulan|60\s*hari|60\s*days|8\s*week/i.test(pref)) {
      const match = options.find(o => /2\s*month|two\s*month|2\s*bulan|60\s*hari|60\s*days|8\s*week/i.test(o));
      if (match) return [match];
    } else {
      // Default: Immediately / ASAP / Secepatnya / Segera / Langsung
      const asapRegex = /immediately|immediate|asap|as soon as possible|secepatnya|segera|langsung|bisa langsung|siap segera|now|sekarang|0\s*day|0\s*hari/i;
      const match = options.find(o => asapRegex.test(o));
      if (match) return [match];
    }
    return [options[0]];
  }

  // Kesediaan kerja / Relocation / Onsite / Working Policy / Yes-No Suitability
  if (/bersedia|willing|relocate|di lokasi|onsite|on-site|hybrid|remote|wfo|wfh|policy/i.test(q) && options.some(o => /^(ya|yes|true)$/i.test(o.trim()))) {
    const match = options.find(o => /^(ya|yes|true)$/i.test(o.trim())) || options.find(o => /ya|yes/i.test(o));
    if (match) return [match];
  }

  // Resume file selection: options look like filenames (.pdf) plus a
  // "don't include" choice.
  if (options.some((o) => /\.pdf$/i.test(o))) {
    const match = options.find((o) =>
      o.toLowerCase().includes(profile.preferredResumeHint.toLowerCase())
    );
    return match ? [match] : [profile.resumeFallback];
  }

  // "Make this my default resumé" style single checkbox (checklist with
  // exactly one option).
  if (
    type === "checklist" &&
    options.length === 1 &&
    /default resum/i.test(options[0])
  ) {
    return profile.wantDefaultResume ? [options[0]] : [];
  }

  // Tools/technology/skills/languages/data analysis checklist (multi-select)
  if (type === "checklist" && /revision control|tools|alat|technolog|skill|kemampuan|language|bahasa|program|analisis|data|software|aplikasi/i.test(q)) {
    const allKnown = [...profile.knownTools, ...dynamicSkills].map(s => s.toLowerCase().trim());
    const matches = options.filter((o) => {
      const optLower = o.toLowerCase().trim();
      if (/tidak satupun|none of the above|none/i.test(optLower)) return false;
      return allKnown.some((tool) => {
        if (tool.length <= 2) {
          // Exact match for short names like "C", "R", "Go"
          return optLower === tool || optLower.split(/\s+/).includes(tool);
        }
        return optLower.includes(tool) || tool.includes(optLower);
      });
    });

    if (matches.length > 0) {
      return matches;
    }
    
    // If no tools match, pick "Tidak satupun" / "None of these"
    const noneOption = options.find(o => /tidak satupun|none|tidak ada/i.test(o));
    return noneOption ? [noneOption] : [options[options.length - 1]];
  }

  // Skill proficiency rating question (Glints matrix sub-questions: Tidak Berpengalaman / Dasar / Menengah / Ahli)
  if (options.some(o => /Tidak Berpengalaman|Dasar|Menengah|Ahli|NO_EXPERIENCE|BASIC|INTERMEDIATE|ADVANCED/i.test(o))) {
    const allKnown = [...profile.knownTools, ...dynamicSkills].map(s => s.toLowerCase());
    const cleanQ = q.replace(/seberapa mahir.*keahlian berikut.*-?/i, '').trim();
    const isKnown = allKnown.some(skill => cleanQ.includes(skill) || skill.includes(cleanQ));
    
    if (isKnown) {
      // Selalu pilih "Ahli" (atau ADVANCED/Expert) untuk skill yang dikuasai
      const expertMatch = options.find(o => /^(Ahli|ADVANCED|Expert)$/i.test(o.trim())) ||
                          options.find(o => /Ahli|ADVANCED|Expert/i.test(o)) ||
                          options.find(o => /Menengah|INTERMEDIATE/i.test(o));
      return expertMatch ? [expertMatch] : [options[options.length - 1]];
    } else {
      // Pilih "Dasar" untuk skill di luar profil
      const basicMatch = options.find(o => /^(Dasar|BASIC)$/i.test(o.trim())) ||
                         options.find(o => /Dasar|BASIC/i.test(o)) ||
                         options.find(o => /Tidak Berpengalaman|NO_EXPERIENCE/i.test(o));
      return basicMatch ? [basicMatch] : [options[0]];
    }
  }

  // Pertanyaan Kemahiran Bahasa Inggris / Language Proficiency (Rating 1 - 10 atau isian teks)
  if (/english|bahasa inggris|proficiency|self-rate|1 to 10|1-10|kemampuan bahasa/i.test(q)) {
    if (/1 to 10|1-10|scale|rate.*from|score/i.test(q)) {
      return ["8"];
    }
    if (options.length > 0) {
      const match = options.find(o => /fluent|mahir|proficient|advanced|professional/i.test(o));
      if (match) return [match];
    }
    return ["Proficient / Fluent (8/10)"];
  }

  // Pertanyaan GPA / IPK
  if (/gpa|ipk|grade point/i.test(q)) {
    return [profile.gpa || "3.75"];
  }

  // Pertanyaan Gaji jika open text
  if (/salary|gaji|penghasilan/i.test(q) && (options.length === 0 || type === "text")) {
    return [String(profile.expectedMonthlySalaryIDR || 8000000)];
  }

  // Pertanyaan Portofolio / GitHub / LinkedIn jika open text
  if (/github/i.test(q)) {
    return [profile.github || "https://github.com/yogaadi"];
  }
  if (/linkedin/i.test(q)) {
    return [profile.linkedin || "https://www.linkedin.com"];
  }
  if (/portfolio|portofolio|website|link/i.test(q) && (options.length === 0 || type === "text")) {
    return [profile.portfolio || "https://github.com/yogaadi"];
  }

  // Pertanyaan Kesiapan Mulai Bekerja (Notice Period / ASAP / Kapan Bisa Bergabung)
  if (/notice period|notice periode|asap|kapan bisa mulai|kapan bisa bergabung|join immediately|start immediately|ketersediaan mulai|kapan bersedia|available to start|waktu mulai bekerja/i.test(q)) {
    const notice = profile.noticePeriod || "Immediately";
    if (options.length > 0) {
      const match = options.find(o => /immediately|secepatnya|asap|segera|1 month|1 bulan/i.test(o));
      if (match) return [match];
    }
    if (/asap|immediately|segera/i.test(notice)) {
      return ["Saya bersedia untuk segera bergabung (ASAP / Immediately)."];
    }
    return [notice];
  }

  // Pertanyaan Tahun Pengalaman jika murni numerik
  if (/how many years|berapa tahun/i.test(q) && (options.length === 0 || type === "text")) {
    return [String(yearsForRole(question))];
  }

  return null;
}

// ---------------------------------------------------------------------------
// 5. LLM fallback for anything regex couldn't classify
// ---------------------------------------------------------------------------

function getGeminiAi(customConfig?: AppConfig): GoogleGenerativeAI | null {
  const cfg = customConfig || getConfig();
  const apiKey = (cfg.geminiApiKey || process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
}

async function askLLM(
  question: string,
  options: string[],
  type: QuestionType,
  customConfig?: AppConfig
): Promise<string[]> {
  const cfg = customConfig || getConfig();
  const profile = getDynamicProfile(cfg);
  const dynamicSkills = getDynamicSkills(cfg);

  if (type === "text" || options.length === 0) {
    const prompt = `You are answering a job application screening question on behalf of a candidate.

Candidate profile:
- Role: Full Stack Developer (Skills: ${dynamicSkills.slice(0, 15).join(', ')})
- Experience: ${profile.defaultExperienceYears} years
- Education: ${profile.educationLevel}, GPA: ${profile.gpa}
- Expected salary: Rp ${profile.expectedMonthlySalaryIDR.toLocaleString("id-ID")}
- Availability: ${profile.noticePeriod}

Question: "${question}"

Reply with a concise, highly professional, direct answer (1-2 sentences maximum, or just the number/fact if it's a simple factual question). Reply in the same language as the question (Indonesian or English).`;

    try {
      const aiInstance = getGeminiAi(customConfig);
      if (aiInstance) {
        const model = aiInstance.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(prompt);
        const text = (result.response.text() || "").trim();
        if (text) return [text];
      }
    } catch {}

    // Smart context-aware fallback based on question intent (when AI is unavailable or offline)
    const lowerQ = question.toLowerCase();
    if (/notice|asap|join|mulai kerja|bergabung/i.test(lowerQ)) {
      const notice = profile.noticePeriod || "Immediately";
      return [/asap|immediately|segera/i.test(notice) ? "Saya bersedia untuk segera bergabung (ASAP / Immediately)." : notice];
    }
    if (/salary|gaji|penghasilan|upah|ekspektasi gaji/i.test(lowerQ)) {
      return [String(profile.expectedMonthlySalaryIDR || 8000000)];
    }
    if (/english|bahasa inggris|rate|1 to 10|skala 1/i.test(lowerQ)) return ["8"];
    if (/gpa|ipk/i.test(lowerQ)) return [profile.gpa || "3.75"];
    if (/experience|tahun|lama bekerja/i.test(lowerQ)) return [String(profile.defaultExperienceYears || 3)];
    if (/project|proyek/i.test(lowerQ)) return ["4"];
    if (/age|umur|usia/i.test(lowerQ)) return ["24"];
    if (/phone|telepon|hp|mobile|wa|whatsapp/i.test(lowerQ)) return [cfg.phoneNumber || "081234567890"];
    if (/name|nama/i.test(lowerQ)) return [cfg.fullName || "Yoga Adi Saputra"];
    if (/why|alasan|describe|ceritakan|jelaskan|introduce|tentang anda/i.test(lowerQ)) {
      return ["Saya memiliki keahlian dan pengalaman kerja yang relevan serta siap berkontribusi secara maksimal untuk posisi ini."];
    }
    return ["Ya"];
  }

  const multiSelect = type === "checklist";

  const prompt = `You are filling out a job application screening question on behalf of a candidate.

Candidate profile:
- Expected monthly salary: Rp ${profile.expectedMonthlySalaryIDR.toLocaleString("id-ID")}
- Education: ${profile.educationLevel}
- Experience: ${profile.experienceByRole
    .map((e) => `${e.keywords[0]}: ${e.years} years`)
    .join(", ")}; default ${profile.defaultExperienceYears} years for anything else.
- Right to work: ${profile.workRights.en}
- Known tools: ${profile.knownTools.join(", ")}

Question: "${question}"
Question type: ${type} (${multiSelect ? "you may choose MULTIPLE options" : "choose exactly ONE option"})
Allowed options (copy chosen ones verbatim): ${options.map((o) => `"${o}"`).join(" | ")}

Reply with ONLY the chosen option(s), copied exactly from the list. If choosing multiple, separate them with " || ". Nothing else.`;

  try {
    const aiInstance = getGeminiAi(customConfig);
    if (aiInstance) {
      const model = aiInstance.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(prompt);
      const text = (result.response.text() || "").trim();

      const picked = text.split("||").map((s: string) => s.trim());
      const valid = picked.filter((p: string) => options.includes(p));
      if (valid.length > 0) return valid;
    }
  } catch {}

  // Smart options fallback (pilihan cerdas / opsi pertama jika tanpa AI)
  const firstMatch = options.find(o => /^(ya|yes|setuju|agree|fluent|mahir|sarjana|s1|full-time|wfo|hybrid|remote|bersedia|ada|siap|sangat siap|bisa|bisa segera)$/i.test(o.trim()));
  return [firstMatch || options[0] || "Ya"];
}

// ---------------------------------------------------------------------------
// 6. In-Memory Knowledge Base Cache (Google Sheets & Local Fallback)
// ---------------------------------------------------------------------------

interface CachedQuestion {
  rawQuestion: string;
  normalized: string;
  words: Set<string>;
  type: string;
  options: string[];
  answers: string[];
}

let memoryCache: {
  timestamp: number;
  items: CachedQuestion[];
} | null = null;

export function invalidateKnowledgeBaseCache() {
  memoryCache = null;
}

export function transformQuestionsToCache(
  questions: Array<{ question: string; type?: string; options?: string; answer?: string }>
): CachedQuestion[] {
  const items: CachedQuestion[] = [];
  for (const row of questions) {
    const q = (row.question || '').trim();
    const answerRaw = (row.answer || '').trim();
    if (!q || !answerRaw) continue;

    const clean = q.toLowerCase().trim();
    const normalized = clean.replace(/[^a-z0-9]/g, '');
    const words = new Set(clean.split(/\s+/).filter(w => w.length > 2));
    const answers = answerRaw.split('||').map(a => a.trim()).filter(a => a.length > 0);
    const options = (row.options || '').split('|').map(o => o.trim()).filter(o => o.length > 0);

    items.push({
      rawQuestion: q,
      normalized,
      words,
      type: (row.type || 'radiobutton').toLowerCase().trim(),
      options,
      answers,
    });
  }
  return items;
}

export async function ensureKnowledgeBaseLoaded(customConfig?: AppConfig): Promise<CachedQuestion[]> {
  const now = Date.now();
  if (memoryCache && now - memoryCache.timestamp < 60000) {
    return memoryCache.items;
  }

  const cfg = customConfig || getConfig();

  // 1. Priority: Load from Google Sheets (Screening Questions tab)
  if (cfg.googleCredentialsJson && cfg.spreadsheetId) {
    try {
      const sheetQuestions = await getQuestionsFromSheet(false, cfg);
      if (sheetQuestions.length > 0) {
        const items = transformQuestionsToCache(sheetQuestions);
        memoryCache = { timestamp: now, items };
        return items;
      }
    } catch (e) {
      console.warn('[KnowledgeBase] Failed to fetch from Google Sheets, falling back to local CSV if available:', e);
    }
  }

  // 2. Fallback: Read local imploye-question.csv if exists
  try {
    const csvPath = path.join(process.cwd(), 'public', 'imploye-question.csv');
    if (fs.existsSync(csvPath)) {
      const content = fs.readFileSync(csvPath, 'utf8');
      const records: string[][] = parse(content, {
        columns: false,
        skip_empty_lines: true,
        relax_column_count: true,
        relax_quotes: true,
      });

      const parsed: Array<{ question: string; type: string; options: string; answer: string }> = [];
      for (let i = 1; i < records.length; i++) {
        const cols = records[i];
        if (!cols || cols.length < 2) continue;
        if (cols.length >= 4) {
          parsed.push({ question: cols[0] || '', type: cols[1] || '', options: cols[2] || '', answer: cols[3] || '' });
        } else if (cols.length === 3) {
          parsed.push({ question: cols[0] || '', type: 'radiobutton', options: cols[1] || '', answer: cols[2] || '' });
        }
      }

      const items = transformQuestionsToCache(parsed);
      memoryCache = { timestamp: now, items };
      return items;
    }
  } catch {}

  return memoryCache ? memoryCache.items : [];
}

export function getKnowledgeBase(): CachedQuestion[] {
  return memoryCache ? memoryCache.items : [];
}

// Search knowledge base cache for matching question
function getPreAnsweredQuestion(questionText: string, options: string[], cachedItems: CachedQuestion[]): string[] | null {
  if (cachedItems.length === 0) return null;

  try {
    const targetClean = questionText.toLowerCase().trim();
    const targetNormalized = targetClean.replace(/[^a-z0-9]/g, '');
    const targetWords = new Set(targetClean.split(/\s+/).filter(w => w.length > 2));

    let bestMatchAnswers: string[] | null = null;
    let highestOverlap = 0;

    for (const item of cachedItems) {
      // 1. Exact Normalized Match
      const isExactMatch = targetNormalized === item.normalized;

      // 2. Substring Match
      const isSubstringMatch = !isExactMatch && targetNormalized.length > 10 && item.normalized.length > 10 &&
        (targetNormalized.includes(item.normalized) || item.normalized.includes(targetNormalized));

      // 3. Word Overlap Similarity (jika kemiripan kata >= 70%)
      let matchCount = 0;
      for (const w of item.words) {
        if (targetWords.has(w)) matchCount++;
      }
      const overlapScore = item.words.size > 0 ? matchCount / Math.max(item.words.size, targetWords.size) : 0;

      if (isExactMatch || isSubstringMatch || overlapScore >= 0.7) {
        // Untuk pertanyaan tipe text / isian bebas
        if (item.type === 'text' || options.length === 0) {
          if (isExactMatch) return item.answers;
          if (overlapScore > highestOverlap) {
            highestOverlap = overlapScore;
            bestMatchAnswers = item.answers;
          }
          continue;
        }

        // Untuk dropdown/radio/checklist, validasi apakah jawaban ada di pilihan yang tersedia
        const validAnswers = item.answers.filter(ans => 
          options.includes(ans) || options.some(o => o.toLowerCase() === ans.toLowerCase())
        );

        if (validAnswers.length > 0) {
          if (isExactMatch) return validAnswers;
          if (overlapScore > highestOverlap) {
            highestOverlap = overlapScore;
            bestMatchAnswers = validAnswers;
          }
        }
      }
    }

    if (bestMatchAnswers !== null) {
      return bestMatchAnswers;
    }
  } catch (error) {
    console.error('Failed to match pre-answered questions in memory:', error);
  }
  return null;
}

// Export answerQuestion for bot integration
export async function answerQuestion(
  question: string,
  options: string[],
  type: "dropdown" | "checklist" | "radiobutton" | "text" | "unknown",
  customConfig?: AppConfig
): Promise<string[]> {
  const cfg = customConfig || getConfig();
  try {
    // 1. Priority: Check Google Sheets Knowledge Base Cache
    const cachedItems = await ensureKnowledgeBaseLoaded(cfg);
    const cachedAnswers = getPreAnsweredQuestion(question, options, cachedItems);
    if (cachedAnswers !== null) {
      return cachedAnswers;
    }

    // 2. Second Priority: Regex pattern rules
    const normType = type as QuestionType;
    const regexAnswer = tryRegexAnswer(question, options, normType, cfg);
    if (regexAnswer !== null) {
      // Asynchronously learn & append to Google Sheets knowledge base
      const { appendQuestionToSheet } = require('./googleSheets');
      appendQuestionToSheet(question, type, options, regexAnswer, cfg).catch(() => {});
      return regexAnswer;
    }

    // 3. Fallback: Ask Gemini LLM
    const llmAnswer = await askLLM(question, options, normType, cfg);
    const { appendQuestionToSheet } = require('./googleSheets');
    appendQuestionToSheet(question, type, options, llmAnswer, cfg).catch(() => {});
    return llmAnswer;
  } catch (err) {
    console.error(`AI failed to answer "${question}":`, err);
    return [options[0] || ""]; // fallback to first option
  }
}