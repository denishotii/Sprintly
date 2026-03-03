/**
 * Shared prompt fragments reused across pipeline steps.
 *
 * Mode-aware variants are provided via:
 * - {@link getTechStackRules} — tech constraints per project mode
 * - {@link getOutputStructure} — required file layout per project mode
 *
 * Used by the Builder (and optionally Planner) to assemble mode-specific system prompts.
 */

import type { ProjectMode } from "../pipeline/types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Legacy constants (unchanged for backward compatibility)
// ─────────────────────────────────────────────────────────────────────────────

export const TECH_STACK_RULES = `
## Tech Stack Rules (Non-Negotiable)
- Output must work by double-clicking index.html in a browser — NO build step, NO npm install, NO server
- All dependencies via CDN only (unpkg, cdnjs, jsdelivr)
- Preferred CDN libs: Tailwind CSS, Alpine.js, Lucide icons, Google Fonts (Inter)
- Vanilla JS or Alpine.js for interactivity — no React, no Vue (they need a build step)
- Use ES modules only if supported natively; otherwise use classic <script> tags
`.trim();

export const DESIGN_DEFAULTS = `
## Design Defaults
- Mobile-first responsive layout (works on 320px up to 1440px+)
- CSS custom properties for colors, spacing, and typography
- Dark/light mode via prefers-color-scheme where appropriate
- Spacing scale: multiples of 4px (4, 8, 12, 16, 24, 32, 48, 64)
- Default border-radius: 8px
- Smooth transitions: 150ms ease
- Font: Inter from Google Fonts (fallback: system-ui, sans-serif)
- Color palette: use Tailwind's slate/zinc neutrals + one accent color
`.trim();

export const OUTPUT_STRUCTURE = `
## Required Output Structure
Every project zip must contain:
  index.html       ← entry point (always required)
  styles/
    main.css       ← styles (always required, even if minimal)
  scripts/
    app.js         ← application logic (required if JS needed)
  README.md        ← always required

Optional additions:
  assets/          ← images, icons, fonts
  components/      ← HTML partials or JS modules
  data/            ← JSON data files
`.trim();

export const HTML_QUALITY_RULES = `
## HTML Quality Rules
- Always start with <!DOCTYPE html>
- Set lang attribute: <html lang="en">
- Required meta tags: charset, viewport, description, og:title
- Use semantic elements: <header>, <main>, <section>, <article>, <footer>, <nav>
- Images must have meaningful alt attributes
- Form inputs must have associated <label> elements
- Headings must follow hierarchy (h1 → h2 → h3, no skipping)
- Links that open in new tab must include rel="noopener noreferrer"
`.trim();

export const CDN_URLS = `
## Approved CDN URLs
Tailwind CSS:    https://cdn.tailwindcss.com
Alpine.js:       https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js
Lucide icons:    https://unpkg.com/lucide@latest
Google Fonts:    https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap
Chart.js:        https://cdn.jsdelivr.net/npm/chart.js
Marked (MD):     https://cdn.jsdelivr.net/npm/marked/marked.min.js
`.trim();

// ─────────────────────────────────────────────────────────────────────────────
// Performance & React CDN (for web modes; judges evaluate load speed)
// ─────────────────────────────────────────────────────────────────────────────

/** Performance rules for web modes — only load what's needed, optimize for speed. */
export const PERFORMANCE_RULES = `
## Performance (Judges evaluate site load speed)
- Only load CDN libraries the project actually uses
- Add loading="lazy" to images below the fold
- Use <link rel="preconnect"> for Google Fonts and CDN origins
- Defer non-critical scripts: <script defer src="...">
- Minimize DOM depth — clean semantic HTML loads faster
- Use font-display: swap for Google Fonts
`.trim();

/** Approved CDN URLs for React mode (no build step). */
export const REACT_CDN_URLS = `
## React CDN URLs (use these — no npm, no build)
React 18:        https://unpkg.com/react@18/umd/react.production.min.js
ReactDOM 18:     https://unpkg.com/react-dom@18/umd/react-dom.production.min.js
Babel Standalone: https://unpkg.com/@babel/standalone/babel.min.js
`.trim();

// ─────────────────────────────────────────────────────────────────────────────
// Mode-specific content (used by getTechStackRules / getOutputStructure)
// ─────────────────────────────────────────────────────────────────────────────

const REACT_TECH_STACK_RULES = [
  "## Tech Stack Rules (Non-Negotiable)",
  "- Output must work by opening index.html in a browser — NO build step, NO npm install, NO webpack, NO vite",
  "- Load React 18, ReactDOM 18, and Babel Standalone via CDN (see React CDN URLs below)",
  "- JSX in <script type=\"text/babel\"> or external .jsx loaded with type=\"text/babel\"",
  "- Tailwind CSS via CDN is allowed alongside React",
  "- Use ES modules only if supported natively; otherwise use classic <script> tags",
].join("\n");

const PYTHON_TECH_STACK_RULES = [
  "## Tech Stack Rules (Non-Negotiable)",
  "Generate complete, runnable Python 3.10+ code. Include requirements.txt listing all third-party packages.",
  "Use type hints. Add docstrings to public functions. Include `if __name__ == '__main__':` guard in entry point.",
  "Prefer standard library where possible; add only necessary dependencies to requirements.txt.",
].join("\n");

const NODE_TECH_STACK_RULES = [
  "## Tech Stack Rules (Non-Negotiable)",
  "Generate complete, runnable Node.js 18+ code. Include package.json with name, version, description, main, scripts (start), and dependencies.",
  "Use ES modules (import/export) with \"type\": \"module\" in package.json. Include error handling.",
  "No TypeScript build step — output plain JavaScript unless the plan explicitly requests a minimal setup.",
].join("\n");

const REACT_OUTPUT_STRUCTURE = [
  "## Required Output Structure",
  "Every project zip must contain:",
  "  index.html  ← THE ONLY FILE THAT RUNS. Contains CDN scripts + <div id=\"root\"> + entire React app in ONE inline <script type=\"text/babel\"> block. Do NOT load app code via script src=.",
  "  README.md    ← always required",
  "",
  "Optional: styles/main.css (inline in index.html or <style>). Do not add scripts/app.jsx or app.tsx — the app runs entirely from index.html.",
].join("\n");

const PYTHON_OUTPUT_STRUCTURE = [
  "## Required Output Structure",
  "Every project zip must contain:",
  "  main.py (or app.py)  ← entry point",
  "  requirements.txt     ← all third-party dependencies",
  "  README.md            ← setup and run instructions",
  "",
  "Optional: utils/, data/, templates/ (for Flask/Django)",
].join("\n");

const NODE_OUTPUT_STRUCTURE = [
  "## Required Output Structure",
  "Every project zip must contain:",
  "  index.js (or app.js) ← entry point (or file specified in package.json main)",
  "  package.json        ← name, version, main, scripts.start, dependencies",
  "  README.md            ← setup and run instructions",
  "",
  "Optional: src/, utils/, routes/",
].join("\n");

// ─────────────────────────────────────────────────────────────────────────────
// Mode-aware helpers (used by builder/planner per ProjectMode)
// ─────────────────────────────────────────────────────────────────────────────

/** Asserts exhaustiveness so new ProjectMode values require handling here. */
function assertNever(mode: never): never {
  throw new Error(`Unhandled project mode: ${String(mode)}`);
}

/**
 * Returns tech stack rules for the given project mode.
 * Used by the Builder system prompt to enforce CDN/runtime constraints per mode.
 *
 * @param mode — one of website, web-app, react-app, python, node, text
 * @returns Mode-specific tech stack rules string
 */
export function getTechStackRules(mode: ProjectMode): string {
  switch (mode) {
    case "website":
    case "web-app":
      return TECH_STACK_RULES;
    case "react-app":
      return REACT_TECH_STACK_RULES;
    case "python":
      return PYTHON_TECH_STACK_RULES;
    case "node":
      return NODE_TECH_STACK_RULES;
    case "text":
      return "## Tech Stack\nNo code project — text response only.";
    default:
      return assertNever(mode);
  }
}

/**
 * Returns required output structure (file layout) for the given project mode.
 * Used by the Builder system prompt to describe expected files and folders.
 *
 * @param mode — one of website, web-app, react-app, python, node, text
 * @returns Mode-specific output structure string
 */
export function getOutputStructure(mode: ProjectMode): string {
  switch (mode) {
    case "website":
    case "web-app":
      return OUTPUT_STRUCTURE;
    case "react-app":
      return REACT_OUTPUT_STRUCTURE;
    case "python":
      return PYTHON_OUTPUT_STRUCTURE;
    case "node":
      return NODE_OUTPUT_STRUCTURE;
    case "text":
      return "## Output\nNo files — deliver the response as plain text only.";
    default:
      return assertNever(mode);
  }
}
