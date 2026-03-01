/**
 * Template loader — exports design system CSS as strings for injection into generated projects.
 * Also exports T10 component examples for the Builder system prompt.
 *
 * Usage in the pipeline:
 *   import { getBaseCSS, getComponentsCSS, getFullDesignSystem } from '../templates/index.js';
 *
 *   // Inject into a project's styles/main.css:
 *   builder.addFile('styles/main.css', getFullDesignSystem(overrides));
 *
 *   // Or reference them as separate files:
 *   builder.addFile('styles/base.css', getBaseCSS());
 *   builder.addFile('styles/components.css', getComponentsCSS());
 */

export { BUILDER_COMPONENT_EXAMPLES } from "./prompt-examples.js";

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Lazy-loaded CSS strings */
let _baseCSS: string | null = null;
let _componentsCSS: string | null = null;

/** Return the base CSS (reset + design tokens). */
export function getBaseCSS(): string {
  if (!_baseCSS) {
    _baseCSS = readFileSync(join(__dirname, "base.css"), "utf-8");
  }
  return _baseCSS;
}

/** Return the components CSS (utility classes). */
export function getComponentsCSS(): string {
  if (!_componentsCSS) {
    _componentsCSS = readFileSync(join(__dirname, "components.css"), "utf-8");
  }
  return _componentsCSS;
}

/** Return both stylesheets concatenated — drop-in `styles/main.css` for any project. */
export function getFullDesignSystem(overrides?: string): string {
  const base = getBaseCSS();
  const components = getComponentsCSS();
  const customSection = overrides
    ? `\n\n/* ── Project Overrides ───────────────────────────────────── */\n${overrides}`
    : "";
  return `${base}\n\n${components}${customSection}`;
}

/**
 * Generate a project-specific CSS override block.
 * Pass an accent color to swap out the default blue primary palette.
 *
 * @example
 *   getColorOverrides('#f97316') // → CSS that replaces --color-primary with orange
 */
export function getColorOverrides(accentHex: string): string {
  // Simplified — builders can expand this with proper shade generation
  return `:root {
  --color-primary: ${accentHex};
}`;
}

/**
 * Accent color presets by domain.
 * The Builder prompt uses these names; templates/index.ts maps them to hex.
 */
export const ACCENT_PRESETS = {
  /** SaaS / tech */
  blue:    { primary: "#3b82f6", hover: "#2563eb", light: "#eff6ff", text: "#1e40af" },
  violet:  { primary: "#8b5cf6", hover: "#7c3aed", light: "#f5f3ff", text: "#4c1d95" },
  /** Food / lifestyle */
  orange:  { primary: "#f97316", hover: "#ea580c", light: "#fff7ed", text: "#7c2d12" },
  green:   { primary: "#22c55e", hover: "#16a34a", light: "#f0fdf4", text: "#14532d" },
  /** Professional / finance */
  slate:   { primary: "#475569", hover: "#334155", light: "#f8fafc", text: "#0f172a" },
  indigo:  { primary: "#4f46e5", hover: "#4338ca", light: "#eef2ff", text: "#312e81" },
  /** Creative / portfolio */
  pink:    { primary: "#ec4899", hover: "#db2777", light: "#fdf2f8", text: "#831843" },
  amber:   { primary: "#f59e0b", hover: "#d97706", light: "#fffbeb", text: "#78350f" },
} as const;

export type AccentPreset = keyof typeof ACCENT_PRESETS;

/**
 * Get CSS variable overrides for a named accent preset.
 */
export function getPresetOverrides(preset: AccentPreset): string {
  const p = ACCENT_PRESETS[preset];
  return `:root {
  --color-primary:       ${p.primary};
  --color-primary-hover: ${p.hover};
  --color-primary-light: ${p.light};
  --color-primary-text:  ${p.text};
}`;
}

/**
 * Get a minimal `styles/main.css` that imports the design system from CDN
 * and adds project-specific overrides.
 *
 * For self-contained projects (no CDN for our own CSS), use getFullDesignSystem() instead.
 */
export function getMinimalCSS(overrides?: string): string {
  return [
    "/* Project styles — see base.css and components.css for full design system */",
    "",
    ":root {",
    "  /* Override design tokens here */",
    "  /* --color-primary: #your-accent-color; */",
    "}",
    "",
    overrides ?? "",
  ]
    .join("\n")
    .trim();
}
