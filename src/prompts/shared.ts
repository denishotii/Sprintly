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
