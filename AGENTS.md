<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# UI/UX & Design Guidelines (UI/UX Pro Max Standard)

## 1. Minimalist, Clean & Professional Aesthetics
- **Zero Decorative Emojis**: Do NOT use emojis (e.g. 🚀, 💾, 🎉, 📝, 💡, 🛡️, 📥, 📤, 💻, etc.) in UI buttons, titles, cards, navigation tabs, or toast/alert messages. Use clean text or lightweight, semantic SVG icons (Lucide / Heroicons) instead.
- **Concise & Purposeful Microcopy**: Eliminate walls of redundant explanatory text, disclaimers, or obvious descriptions under input fields. Keep copy sharp, concise, and professional.
- **Consistent Modern Light Palette (Slate / Zinc)**: Use a cohesive Slate light color hierarchy:
  - Backgrounds: `bg-slate-50` (base container/body), `bg-white` (cards/panels/modals), `bg-slate-50/80` (inner sections/table header).
  - Borders: `border-slate-200` (default divider/card border), `hover:border-slate-300`, `focus:border-indigo-500`.
  - Text Hierarchy: `text-slate-900` / `text-slate-800` (headings & primary labels), `text-slate-600` (secondary/values), `text-slate-400` / `text-slate-500` (muted annotations).
  - Accents: `emerald-600` (success/primary actions), `indigo-600` (links/secondary/tabs), `amber-600` (warning/pending), `rose-600` (danger/destructive).

## 2. Layout, Spacing & Density
- **Data-Dense & Efficient**: Avoid massive empty padding; use 4px/8px incremental rhythm (`p-3`, `p-4`, `space-y-3`, `gap-3`).
- **No Redundant / Dead Cards**: Do not create standalone cards solely to display non-actionable descriptions. Group relevant metrics, badges, and controls into single cohesive cards.
- **Typography Standards**:
  - `text-xs` (12px) is the absolute floor for readable body/labels. Never use sub-11px unless strictly necessary for small technical badges.
  - Section headers: `text-sm font-semibold text-slate-200` or `text-base font-semibold`.
  - Form field labels: `text-xs font-semibold text-slate-400 uppercase tracking-wider`.

## 3. Component Interaction & State Polish
- **Feedback & Transitions**: Fast, subtle feedback with `transition-colors duration-150` or `transition-all duration-200`. Avoid sudden 0ms snaps or sluggish >300ms delays.
- **Clickable Affordance**: All interactive items must feature `cursor-pointer` (or `cursor-not-allowed` when disabled).
- **Disabled State Clarity**: Explicit opacity reduction (`opacity-50 pointer-events-none` or `cursor-not-allowed text-slate-500 bg-slate-900`).
- **Icon Sizing & Consistency**: Vector SVGs only. Uniform size (`w-4 h-4` or `w-5 h-5`), aligned to text baseline with `inline-flex items-center gap-2`.
