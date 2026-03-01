/**
 * Shared prompt fragments reused across pipeline steps.
 */

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
- Font: Inter from Google Fonts — add <link rel="preconnect" href="https://fonts.googleapis.com"> and load Inter in <head>; apply with class="font-sans" on <body>
- Color palette: Tailwind slate/zinc neutrals + ONE project accent color (see Visual Design Standards)
- Smooth transitions: transition-all duration-200 on interactive elements
- Rounded corners: rounded-xl for cards, rounded-full for buttons and badges, rounded-2xl for large containers
- Max content width: max-w-6xl mx-auto (sections), max-w-4xl mx-auto (text-heavy areas)
- Use shadow-sm on cards at rest, shadow-lg on hover — never flat/no-shadow cards
`.trim();

export const OUTPUT_STRUCTURE = `
## Required Output Structure
Every project must contain:
  index.html       ← entry point (always required)
  README.md        ← always required

Auto-provided (do NOT generate these — they are injected automatically):
  styles/main.css  ← complete design system CSS (.btn, .card, .nav, .hero, etc.) — auto-injected

Optional additions (only include if the plan calls for them):
  scripts/app.js   ← JS logic (only for apps with significant interactive behavior)
  data/            ← JSON data files
  assets/          ← images, icons, fonts

NEVER write styles/main.css — it is auto-provided. Put only project-specific accent color overrides in a <style> block inside index.html.
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
