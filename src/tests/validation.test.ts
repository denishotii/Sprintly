import { describe, it, expect } from "vitest";
import { validateFiles } from "../pipeline/verifier.js";
import type { ProjectFile } from "../tools/projectBuilder.js";

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

const VALID_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test</title>
  <link rel="stylesheet" href="styles/main.css">
</head>
<body>
  <h1>Hello</h1>
  <script src="scripts/app.js"></script>
</body>
</html>`;

const VALID_CSS = `:root { --color-primary: #3b82f6; }
body { margin: 0; font-family: sans-serif; }
.container { max-width: 1200px; margin: auto; }`;

const VALID_JS = `'use strict';
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn');
  if (btn) btn.addEventListener('click', () => alert('clicked'));
});`;

const VALID_README = `# My Project

## Overview
A complete web project with all the features you need.

## How to Run
Open index.html in any modern browser.`;

/** Build a minimal passing file set. */
function validProject(overrides: Partial<Record<string, string>> = {}): ProjectFile[] {
  const base: Record<string, string> = {
    "index.html": VALID_HTML,
    "styles/main.css": VALID_CSS,
    "scripts/app.js": VALID_JS,
    "README.md": VALID_README,
    ...overrides,
  };
  return Object.entries(base).map(([path, content]) => ({ path, content }));
}

// ─────────────────────────────────────────
// Tests
// ─────────────────────────────────────────

describe("validateFiles", () => {
  // ── 1. index.html ───────────────────────────────────────────
  describe("Check 1 — index.html exists", () => {
    it("passes when index.html is present", () => {
      const { passed } = validateFiles(validProject());
      expect(passed).toBe(true);
    });

    it("fails when index.html is missing", () => {
      const files = validProject();
      const without = files.filter((f) => f.path !== "index.html");
      const { issues, passed } = validateFiles(without);
      expect(passed).toBe(false);
      expect(issues.some((i: string) => i.includes("index.html is missing"))).toBe(true);
    });
  });

  // ── 2. README.md ────────────────────────────────────────────
  describe("Check 2 — README.md", () => {
    it("fails when README.md is missing", () => {
      const files = validProject();
      const without = files.filter((f) => f.path !== "README.md");
      const { issues } = validateFiles(without);
      expect(issues.some((i: string) => i.includes("README.md is missing"))).toBe(true);
    });

    it("fails when README.md has fewer than 50 chars of content", () => {
      const { issues } = validateFiles(validProject({ "README.md": "Short." }));
      expect(issues.some((i: string) => i.includes("very little content"))).toBe(true);
    });

    it("passes when README.md has sufficient content", () => {
      const { passed } = validateFiles(validProject());
      expect(passed).toBe(true);
    });
  });

  // ── 3. Empty files ──────────────────────────────────────────
  describe("Check 3 — no empty files", () => {
    it("fails when a file is completely empty", () => {
      const { issues } = validateFiles(validProject({ "scripts/app.js": "   " }));
      expect(issues.some((i: string) => i.includes("File is empty"))).toBe(true);
    });
  });

  // ── 4. HTML structure ───────────────────────────────────────
  describe("Check 4 — HTML structure", () => {
    it("fails when DOCTYPE is missing", () => {
      const bad = VALID_HTML.replace("<!DOCTYPE html>\n", "");
      const { issues } = validateFiles(validProject({ "index.html": bad }));
      expect(issues.some((i: string) => i.includes("missing <!DOCTYPE html>"))).toBe(true);
    });

    it("fails when <html> tag is missing", () => {
      const bad = VALID_HTML.replace("<html lang=\"en\">", "").replace("</html>", "");
      const { issues } = validateFiles(validProject({ "index.html": bad }));
      expect(issues.some((i: string) => i.includes("missing <html> tag"))).toBe(true);
    });

    it("fails when <head> is missing", () => {
      const bad = VALID_HTML.replace("<head>", "<div>").replace("</head>", "</div>");
      const { issues } = validateFiles(validProject({ "index.html": bad }));
      expect(issues.some((i: string) => i.includes("missing <head> tag"))).toBe(true);
    });

    it("fails when <body> is missing", () => {
      const bad = VALID_HTML.replace("<body>", "<main>").replace("</body>", "</main>");
      const { issues } = validateFiles(validProject({ "index.html": bad }));
      expect(issues.some((i: string) => i.includes("missing <body> tag"))).toBe(true);
    });
  });

  // ── 5. Viewport meta ────────────────────────────────────────
  describe("Check 5 — viewport meta tag", () => {
    it("fails when viewport meta is missing", () => {
      const bad = VALID_HTML.replace(/<meta name="viewport"[^>]+>/i, "");
      const { issues } = validateFiles(validProject({ "index.html": bad }));
      expect(issues.some((i: string) => i.includes("viewport meta tag"))).toBe(true);
    });

    it("passes with single-quoted viewport", () => {
      const html = VALID_HTML.replace('name="viewport"', "name='viewport'");
      const { issues } = validateFiles(validProject({ "index.html": html }));
      expect(issues.some((i: string) => i.includes("viewport meta tag"))).toBe(false);
    });
  });

  // ── 6. <link href> references ───────────────────────────────
  describe("Check 6 — <link href> local file references", () => {
    it("fails when a linked CSS file is missing from the project", () => {
      const html = VALID_HTML.replace("styles/main.css", "styles/missing.css");
      const { issues } = validateFiles(validProject({ "index.html": html }));
      expect(issues.some((i: string) => i.includes("missing file: styles/missing.css"))).toBe(true);
    });

    it("allows CDN CSS links without checking the file list", () => {
      const html = VALID_HTML.replace(
        '<link rel="stylesheet" href="styles/main.css">',
        '<link rel="stylesheet" href="https://cdn.tailwindcss.com">'
      );
      // Remove local CSS file too — should still pass on the link check
      const files = validProject({ "index.html": html }).filter(
        (f) => f.path !== "styles/main.css"
      );
      const { issues } = validateFiles(files);
      expect(issues.some((i: string) => i.includes("cdn.tailwindcss.com"))).toBe(false);
    });

    it("passes with ./relative paths normalised correctly", () => {
      const html = VALID_HTML.replace("styles/main.css", "./styles/main.css");
      const { passed } = validateFiles(validProject({ "index.html": html }));
      expect(passed).toBe(true);
    });
  });

  // ── 7. <script src> references ──────────────────────────────
  describe("Check 7 — <script src> local file references", () => {
    it("fails when a local script file is missing", () => {
      const html = VALID_HTML.replace("scripts/app.js", "scripts/missing.js");
      const { issues } = validateFiles(validProject({ "index.html": html }));
      expect(issues.some((i: string) => i.includes("missing file: scripts/missing.js"))).toBe(true);
    });

    it("ignores CDN script tags", () => {
      const html = VALID_HTML.replace(
        '<script src="scripts/app.js"></script>',
        '<script src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>'
      );
      const files = validProject({ "index.html": html }).filter(
        (f) => f.path !== "scripts/app.js"
      );
      const { issues } = validateFiles(files);
      expect(issues.some((i: string) => i.includes("alpinejs"))).toBe(false);
    });
  });

  // ── 8. <img src> references ─────────────────────────────────
  describe("Check 8 — <img src> local file references", () => {
    it("fails when a local image is referenced but not in the project", () => {
      const html = VALID_HTML.replace(
        "<h1>Hello</h1>",
        '<h1>Hello</h1><img src="assets/hero.png" alt="hero">'
      );
      const { issues } = validateFiles(validProject({ "index.html": html }));
      expect(issues.some((i: string) => i.includes("assets/hero.png"))).toBe(true);
    });

    it("passes when the image file exists in the project", () => {
      const html = VALID_HTML.replace(
        "<h1>Hello</h1>",
        '<h1>Hello</h1><img src="assets/hero.png" alt="hero">'
      );
      const files = validProject({ "index.html": html, "assets/hero.png": "PNG_DATA" });
      const { issues } = validateFiles(files);
      expect(issues.some((i: string) => i.includes("assets/hero.png"))).toBe(false);
    });

    it("ignores CDN image sources", () => {
      const html = VALID_HTML.replace(
        "<h1>Hello</h1>",
        '<h1>Hello</h1><img src="https://placehold.co/600x400" alt="placeholder">'
      );
      const { issues } = validateFiles(validProject({ "index.html": html }));
      expect(issues.some((i: string) => i.includes("placehold.co"))).toBe(false);
    });

    it("ignores data: URIs", () => {
      const html = VALID_HTML.replace(
        "<h1>Hello</h1>",
        '<h1>Hello</h1><img src="data:image/png;base64,abc123" alt="icon">'
      );
      const { issues } = validateFiles(validProject({ "index.html": html }));
      expect(issues.some((i: string) => i.includes("data:image"))).toBe(false);
    });
  });

  // ── 9. CSS file must have substantive content ───────────────
  describe("Check 9 — CSS file not effectively empty", () => {
    it("fails when CSS file is only comments and whitespace", () => {
      const { issues } = validateFiles(
        validProject({ "styles/main.css": "/* TODO: add styles */\n  " })
      );
      expect(issues.some((i: string) => i.includes("effectively empty"))).toBe(true);
    });

    it("fails when CSS has only an empty :root block and @imports", () => {
      const emptyCss = `@import url('https://fonts.googleapis.com/...');\n:root { }`;
      const { issues } = validateFiles(validProject({ "styles/main.css": emptyCss }));
      expect(issues.some((i: string) => i.includes("effectively empty"))).toBe(true);
    });

    it("passes when CSS has real rules", () => {
      const { passed } = validateFiles(validProject());
      expect(passed).toBe(true);
    });
  });

  // ── 10. JS file must have substantive content ───────────────
  describe("Check 10 — JS file not effectively empty", () => {
    it("fails when JS is only 'use strict' and empty DOMContentLoaded", () => {
      const emptyJs = `'use strict';\ndocument.addEventListener('DOMContentLoaded', () => {});`;
      const { issues } = validateFiles(validProject({ "scripts/app.js": emptyJs }));
      expect(issues.some((i: string) => i.includes("effectively empty"))).toBe(true);
    });

    it("passes when JS has real logic beyond the boilerplate", () => {
      const { passed } = validateFiles(validProject());
      expect(passed).toBe(true);
    });
  });

  // ── 11. Alpine.js x-data ────────────────────────────────────
  describe("Check 11 — Alpine.js x-data", () => {
    it("fails when Alpine directives are used but x-data is missing", () => {
      const html = VALID_HTML.replace(
        "<h1>Hello</h1>",
        '<button @click="open = !open">Toggle</button><div x-show="open">Content</div>'
      );
      const { issues } = validateFiles(validProject({ "index.html": html }));
      expect(issues.some((i: string) => i.includes("x-data"))).toBe(true);
    });

    it("passes when x-data is present alongside Alpine directives", () => {
      const html = VALID_HTML.replace(
        "<h1>Hello</h1>",
        '<div x-data="{ open: false }"><button @click="open = !open">Toggle</button><div x-show="open">Content</div></div>'
      );
      const { issues } = validateFiles(validProject({ "index.html": html }));
      expect(issues.some((i: string) => i.includes("x-data"))).toBe(false);
    });

    it("does not flag x-data when no Alpine directives are used", () => {
      const { issues } = validateFiles(validProject());
      expect(issues.some((i: string) => i.includes("x-data"))).toBe(false);
    });
  });

  // ── 12. CSS url() references ────────────────────────────────
  describe("Check 12 — CSS url() local file references", () => {
    it("fails when CSS references a missing local asset via url()", () => {
      const css = `${VALID_CSS}\nbody { background: url('assets/bg.png') no-repeat; }`;
      const { issues } = validateFiles(validProject({ "styles/main.css": css }));
      expect(issues.some((i: string) => i.includes("assets/bg.png"))).toBe(true);
    });

    it("passes when the url() asset exists in the project", () => {
      const css = `${VALID_CSS}\nbody { background: url('assets/bg.png') no-repeat; }`;
      const files = validProject({ "styles/main.css": css, "assets/bg.png": "PNG" });
      const { issues } = validateFiles(files);
      expect(issues.some((i: string) => i.includes("assets/bg.png"))).toBe(false);
    });

    it("ignores CDN URLs in CSS url()", () => {
      const css = `${VALID_CSS}\n@font-face { src: url('https://fonts.gstatic.com/s/inter/v13/abc.woff2'); }`;
      const { issues } = validateFiles(validProject({ "styles/main.css": css }));
      expect(issues.some((i: string) => i.includes("gstatic.com"))).toBe(false);
    });

    it("ignores data: URIs in CSS url()", () => {
      const css = `${VALID_CSS}\n.icon { background: url('data:image/svg+xml,<svg/>'); }`;
      const { issues } = validateFiles(validProject({ "styles/main.css": css }));
      expect(issues.some((i: string) => i.includes("data:image"))).toBe(false);
    });
  });

  // ── Skip LLM when clean ─────────────────────────────────────
  describe("LLM skip optimisation", () => {
    it("returns passed=true for a fully valid project", () => {
      const report = validateFiles(validProject());
      expect(report.passed).toBe(true);
      expect(report.issues).toHaveLength(0);
    });

    it("returns passed=false with at least one issue for any invalid project", () => {
      const files = validProject();
      const without = files.filter((f) => f.path !== "index.html");
      const report = validateFiles(without);
      expect(report.passed).toBe(false);
      expect(report.issues.length).toBeGreaterThan(0);
    });
  });
});
