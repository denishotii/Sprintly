/**
 * Enhanced Design System — Color themes, typography, and design tokens
 *
 * This module provides:
 * - 6 pre-designed color themes (Modern, Corporate, Playful, Minimal, Bold, Creative)
 * - 8 typography font pairings optimized for different styles
 * - Comprehensive design tokens for colors, spacing, typography, shadows, etc.
 * - Theme detection from job description keywords
 *
 * Usage in the pipeline:
 *   import { getThemeCSS, detectThemeFromPrompt, getTypographyCSS } from './designSystem.ts';
 *
 *   // Auto-detect theme from prompt
 *   const theme = detectThemeFromPrompt("Build a fun SaaS landing page");
 *   const css = getThemeCSS(theme);
 *   const typo = getTypographyCSS(theme);
 */

// ── Color Themes ────────────────────────────────────────────────────────

/**
 * Comprehensive color theme with primary, secondary, accent, and semantic colors.
 * All colors include hover/active states and light variants for backgrounds.
 */
export interface ColorTheme {
  name: string;
  description: string;
  keywords: string[]; // Keywords to detect this theme from prompts

  // Primary color (main brand color)
  primary: string;
  primaryHover: string;
  primaryActive: string;
  primaryLight: string;
  primaryText: string;

  // Secondary color (supporting brand color)
  secondary: string;
  secondaryHover: string;
  secondaryLight: string;

  // Accent colors for special emphasis
  accent: string;
  accentHover: string;
  accentLight: string;

  // Semantic colors
  success: string;
  successLight: string;
  warning: string;
  warningLight: string;
  error: string;
  errorLight: string;
  info: string;
  infoLight: string;

  // Gradients for hero sections and CTAs
  gradientPrimary: string;
  gradientSecondary: string;
}

export const COLOR_THEMES = {
  modern: {
    name: "Modern",
    description: "Clean, bright, tech-forward with bold primary blue",
    keywords: ["tech", "saas", "app", "startup", "modern", "software", "ai", "platform"],
    primary: "#0ea5e9",
    primaryHover: "#0284c7",
    primaryActive: "#0369a1",
    primaryLight: "#e0f2fe",
    primaryText: "#0c4a6e",
    secondary: "#3b82f6",
    secondaryHover: "#1d4ed8",
    secondaryLight: "#eff6ff",
    accent: "#6366f1",
    accentHover: "#4f46e5",
    accentLight: "#eef2ff",
    success: "#10b981",
    successLight: "#d1fae5",
    warning: "#f59e0b",
    warningLight: "#fef3c7",
    error: "#ef4444",
    errorLight: "#fee2e2",
    info: "#06b6d4",
    infoLight: "#cffafe",
    gradientPrimary: "linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)",
    gradientSecondary: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
  } as ColorTheme,

  corporate: {
    name: "Corporate",
    description: "Professional, trustworthy with deep indigo and slate tones",
    keywords: ["corporate", "finance", "law", "consulting", "professional", "business", "enterprise", "bank"],
    primary: "#4f46e5",
    primaryHover: "#4338ca",
    primaryActive: "#3730a3",
    primaryLight: "#eef2ff",
    primaryText: "#312e81",
    secondary: "#475569",
    secondaryHover: "#334155",
    secondaryLight: "#f8fafc",
    accent: "#1e293b",
    accentHover: "#0f172a",
    accentLight: "#e2e8f0",
    success: "#059669",
    successLight: "#d1fae5",
    warning: "#d97706",
    warningLight: "#fcd34d",
    error: "#dc2626",
    errorLight: "#fecaca",
    info: "#0891b2",
    infoLight: "#cffafe",
    gradientPrimary: "linear-gradient(135deg, #4f46e5 0%, #1e293b 100%)",
    gradientSecondary: "linear-gradient(135deg, #475569 0%, #64748b 100%)",
  } as ColorTheme,

  playful: {
    name: "Playful",
    description: "Vibrant, energetic, fun with bright oranges and purples",
    keywords: ["playful", "fun", "creative", "design", "agency", "art", "gaming", "kids", "entertainment"],
    primary: "#ec4899",
    primaryHover: "#db2777",
    primaryActive: "#be185d",
    primaryLight: "#fdf2f8",
    primaryText: "#831843",
    secondary: "#f97316",
    secondaryHover: "#ea580c",
    secondaryLight: "#ffedd5",
    accent: "#8b5cf6",
    accentHover: "#7c3aed",
    accentLight: "#ede9fe",
    success: "#22c55e",
    successLight: "#dcfce7",
    warning: "#eab308",
    warningLight: "#fef08a",
    error: "#ef4444",
    errorLight: "#fecaca",
    info: "#06b6d4",
    infoLight: "#cffafe",
    gradientPrimary: "linear-gradient(135deg, #ec4899 0%, #f97316 100%)",
    gradientSecondary: "linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)",
  } as ColorTheme,

  minimal: {
    name: "Minimal",
    description: "Clean, minimal, with neutral grays and single accent",
    keywords: ["minimal", "minimalist", "simple", "clean", "elegant", "editorial", "blog", "magazine"],
    primary: "#000000",
    primaryHover: "#1f2937",
    primaryActive: "#374151",
    primaryLight: "#f3f4f6",
    primaryText: "#1f2937",
    secondary: "#6b7280",
    secondaryHover: "#4b5563",
    secondaryLight: "#f9fafb",
    accent: "#3b82f6",
    accentHover: "#2563eb",
    accentLight: "#eff6ff",
    success: "#059669",
    successLight: "#d1fae5",
    warning: "#d97706",
    warningLight: "#fef3c7",
    error: "#dc2626",
    errorLight: "#fee2e2",
    info: "#0891b2",
    infoLight: "#cffafe",
    gradientPrimary: "linear-gradient(135deg, #000000 0%, #374151 100%)",
    gradientSecondary: "linear-gradient(135deg, #6b7280 0%, #9ca3af 100%)",
  } as ColorTheme,

  bold: {
    name: "Bold",
    description: "Dramatic, high-contrast with vibrant jewel tones",
    keywords: ["bold", "dramatic", "luxury", "fashion", "premium", "exclusive", "dark", "moody"],
    primary: "#7c3aed",
    primaryHover: "#6d28d9",
    primaryActive: "#5b21b6",
    primaryLight: "#f3e8ff",
    primaryText: "#3f0f5c",
    secondary: "#dc2626",
    secondaryHover: "#b91c1c",
    secondaryLight: "#fee2e2",
    accent: "#0891b2",
    accentHover: "#0e7490",
    accentLight: "#06b6d4",
    success: "#059669",
    successLight: "#d1fae5",
    warning: "#f59e0b",
    warningLight: "#fef3c7",
    error: "#dc2626",
    errorLight: "#fee2e2",
    info: "#3b82f6",
    infoLight: "#eff6ff",
    gradientPrimary: "linear-gradient(135deg, #7c3aed 0%, #dc2626 100%)",
    gradientSecondary: "linear-gradient(135deg, #0891b2 0%, #7c3aed 100%)",
  } as ColorTheme,

  creative: {
    name: "Creative",
    description: "Artistic and expressive with warm peachy and sage tones",
    keywords: ["creative", "studio", "portfolio", "artist", "photography", "illustration", "content", "production"],
    primary: "#f97316",
    primaryHover: "#ea580c",
    primaryActive: "#c2410c",
    primaryLight: "#ffedd5",
    primaryText: "#7c2d12",
    secondary: "#84cc16",
    secondaryHover: "#65a30d",
    secondaryLight: "#dcfce7",
    accent: "#06b6d4",
    accentHover: "#0891b2",
    accentLight: "#cffafe",
    success: "#22c55e",
    successLight: "#dcfce7",
    warning: "#eab308",
    warningLight: "#fef08a",
    error: "#ef4444",
    errorLight: "#fee2e2",
    info: "#06b6d4",
    infoLight: "#cffafe",
    gradientPrimary: "linear-gradient(135deg, #f97316 0%, #84cc16 100%)",
    gradientSecondary: "linear-gradient(135deg, #06b6d4 0%, #f97316 100%)",
  } as ColorTheme,
} as const;

export type ThemeName = keyof typeof COLOR_THEMES;

// ── Typography Themes ───────────────────────────────────────────────────

export interface TypographyTheme {
  name: string;
  headingFont: string;
  bodyFont: string;
  monoFont: string;
  fontImports: string;
}

export const TYPOGRAPHY_THEMES = {
  modern: {
    name: "Modern",
    headingFont: "'Inter', system-ui, sans-serif",
    bodyFont: "'Inter', system-ui, sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    fontImports: "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');",
  } as TypographyTheme,

  elegant: {
    name: "Elegant",
    headingFont: "'Poppins', sans-serif",
    bodyFont: "'Open Sans', sans-serif",
    monoFont: "'IBM Plex Mono', monospace",
    fontImports: "@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Open+Sans:wght@400;500;600&display=swap');",
  } as TypographyTheme,

  editorial: {
    name: "Editorial",
    headingFont: "'Playfair Display', serif",
    bodyFont: "'Lora', serif",
    monoFont: "'Courier Prime', monospace",
    fontImports: "@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=Lora:wght@400;500;600&display=swap');",
  } as TypographyTheme,

  friendly: {
    name: "Friendly",
    headingFont: "'Fredoka', sans-serif",
    bodyFont: "'Nunito', sans-serif",
    monoFont: "'Fira Code', monospace",
    fontImports: "@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Nunito:wght@400;500;600&display=swap');",
  } as TypographyTheme,

  professional: {
    name: "Professional",
    headingFont: "'Roboto', sans-serif",
    bodyFont: "'Roboto', sans-serif",
    monoFont: "'Roboto Mono', monospace",
    fontImports: "@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@400;500&display=swap');",
  } as TypographyTheme,

  minimal: {
    name: "Minimal",
    headingFont: "'Syne', sans-serif",
    bodyFont: "'Epilogue', sans-serif",
    monoFont: "'Space Mono', monospace",
    fontImports: "@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Epilogue:wght@400;500;600&display=swap');",
  } as TypographyTheme,

  playful: {
    name: "Playful",
    headingFont: "'Righteous', sans-serif",
    bodyFont: "'Quicksand', sans-serif",
    monoFont: "'Inconsolata', monospace",
    fontImports: "@import url('https://fonts.googleapis.com/css2?family=Righteous&family=Quicksand:wght@400;600&display=swap');",
  } as TypographyTheme,

  bold: {
    name: "Bold",
    headingFont: "'Clash Grotesk', sans-serif",
    bodyFont: "'Space Grotesk', sans-serif",
    monoFont: "'Victor Mono', monospace",
    fontImports: "@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap');",
  } as TypographyTheme,
} as const;

export type TypographyName = keyof typeof TYPOGRAPHY_THEMES;

// ── Enhanced Design Tokens ──────────────────────────────────────────────

export interface DesignTokens {
  colors: ColorTheme;
  typography: TypographyTheme;
  spacing: Record<string, string>;
  typography_scale: Record<string, string>;
  line_heights: Record<string, string>;
  border_radius: Record<string, string>;
  shadows: Record<string, string>;
  transitions: Record<string, string>;
  z_index: Record<string, string>;
}

export function getDefaultDesignTokens(): DesignTokens {
  return {
    colors: COLOR_THEMES.modern,
    typography: TYPOGRAPHY_THEMES.modern,
    spacing: {
      "0": "0",
      "px": "1px",
      "0.5": "0.125rem",
      "1": "0.25rem",
      "1.5": "0.375rem",
      "2": "0.5rem",
      "3": "0.75rem",
      "4": "1rem",
      "5": "1.25rem",
      "6": "1.5rem",
      "8": "2rem",
      "10": "2.5rem",
      "12": "3rem",
      "16": "4rem",
      "20": "5rem",
      "24": "6rem",
      "32": "8rem",
    },
    typography_scale: {
      "xs": "0.75rem",
      "sm": "0.875rem",
      "base": "1rem",
      "lg": "1.125rem",
      "xl": "1.25rem",
      "2xl": "1.5rem",
      "3xl": "1.875rem",
      "4xl": "2.25rem",
      "5xl": "3rem",
      "6xl": "3.75rem",
    },
    line_heights: {
      "tight": "1.25",
      "snug": "1.375",
      "normal": "1.5",
      "relaxed": "1.625",
      "loose": "2",
    },
    border_radius: {
      "sm": "4px",
      "base": "8px",
      "md": "8px",
      "lg": "12px",
      "xl": "16px",
      "2xl": "24px",
      "full": "9999px",
    },
    shadows: {
      "sm": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      "base": "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
      "md": "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
      "lg": "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
      "xl": "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
    },
    transitions: {
      "fast": "100ms ease",
      "base": "150ms ease",
      "slow": "300ms ease",
      "spring": "300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
    },
    z_index: {
      "below": "-1",
      "base": "0",
      "raised": "10",
      "dropdown": "20",
      "sticky": "30",
      "overlay": "40",
      "modal": "50",
      "toast": "60",
      "tooltip": "70",
    },
  };
}

// ── Theme Detection ────────────────────────────────────────────────────

/**
 * Automatically detect the best theme based on keywords in the job prompt.
 * Returns "modern" as fallback if no keywords match.
 */
export function detectThemeFromPrompt(prompt: string): ThemeName {
  const lowerPrompt = prompt.toLowerCase();

  for (const [themeName, theme] of Object.entries(COLOR_THEMES)) {
    for (const keyword of theme.keywords) {
      if (lowerPrompt.includes(keyword.toLowerCase())) {
        return themeName as ThemeName;
      }
    }
  }

  return "modern"; // Default fallback
}

/**
 * Automatically detect the best typography theme based on prompt.
 */
export function detectTypographyFromPrompt(prompt: string): TypographyName {
  const lowerPrompt = prompt.toLowerCase();

  // Map keywords to typography themes
  const typographyMap: Record<TypographyName, string[]> = {
    editorial: ["blog", "magazine", "news", "article", "editorial", "publication"],
    elegant: ["elegant", "luxury", "premium", "high-end", "upscale"],
    friendly: ["friendly", "playful", "kids", "fun", "casual"],
    professional: ["corporate", "finance", "law", "professional", "business", "enterprise"],
    minimal: ["minimal", "minimalist", "simple", "clean"],
    playful: ["creative", "artistic", "vibrant"],
    bold: ["bold", "dramatic", "fashion", "premium", "luxury"],
    modern: [], // catch-all fallback
  };

  for (const [typography, keywords] of Object.entries(typographyMap)) {
    for (const keyword of keywords) {
      if (lowerPrompt.includes(keyword.toLowerCase())) {
        return typography as TypographyName;
      }
    }
  }

  return "modern"; // Default fallback
}

// ── CSS Generation ────────────────────────────────────────────────────

/**
 * Generate CSS custom properties (design tokens) from a theme.
 * Inject these into the generated HTML to customize the design system.
 */
export function getThemeCSS(themeName: ThemeName = "modern"): string {
  const theme = COLOR_THEMES[themeName];
  return `:root {
  /* ── Color Theme: ${theme.name} ────────────────────────────────────────── */

  /* Primary color (main brand) */
  --color-primary:       ${theme.primary};
  --color-primary-hover: ${theme.primaryHover};
  --color-primary-active: ${theme.primaryActive};
  --color-primary-light: ${theme.primaryLight};
  --color-primary-text:  ${theme.primaryText};

  /* Secondary color (supporting brand) */
  --color-secondary:       ${theme.secondary};
  --color-secondary-hover: ${theme.secondaryHover};
  --color-secondary-light: ${theme.secondaryLight};

  /* Accent color (emphasis) */
  --color-accent:       ${theme.accent};
  --color-accent-hover: ${theme.accentHover};
  --color-accent-light: ${theme.accentLight};

  /* Semantic colors */
  --color-success:      ${theme.success};
  --color-success-light: ${theme.successLight};
  --color-warning:      ${theme.warning};
  --color-warning-light: ${theme.warningLight};
  --color-error:        ${theme.error};
  --color-error-light:  ${theme.errorLight};
  --color-info:         ${theme.info};
  --color-info-light:   ${theme.infoLight};

  /* Gradients */
  --gradient-primary:   ${theme.gradientPrimary};
  --gradient-secondary: ${theme.gradientSecondary};
}`;
}

/**
 * Generate font imports and typography CSS variables for a typography theme.
 */
export function getTypographyCSS(typographyName: TypographyName = "modern"): string {
  const typo = TYPOGRAPHY_THEMES[typographyName];
  return `${typo.fontImports}

:root {
  --font-heading: ${typo.headingFont};
  --font-body:    ${typo.bodyFont};
  --font-mono:    ${typo.monoFont};
}`;
}

/**
 * Generate complete CSS with theme, typography, and extra design tokens.
 */
export function getEnhancedDesignSystemCSS(
  themeName: ThemeName = "modern",
  typographyName: TypographyName = "modern"
): string {
  const themeCSS = getThemeCSS(themeName);
  const typographyCSS = getTypographyCSS(typographyName);

  return [
    typographyCSS,
    "",
    themeCSS,
    "",
    `:root {
  /* ── Enhanced Spacing Scale ────────────────────────────────────────── */
  --space-0:   0;
  --space-px:  1px;
  --space-0-5: 0.125rem;
  --space-1:   0.25rem;
  --space-1-5: 0.375rem;
  --space-2:   0.5rem;
  --space-3:   0.75rem;
  --space-4:   1rem;
  --space-5:   1.25rem;
  --space-6:   1.5rem;
  --space-8:   2rem;
  --space-10:  2.5rem;
  --space-12:  3rem;
  --space-16:  4rem;
  --space-20:  5rem;
  --space-24:  6rem;
  --space-32:  8rem;

  /* ── Typography Scale ────────────────────────────────────────────── */
  --text-xs:   0.75rem;
  --text-sm:   0.875rem;
  --text-base: 1rem;
  --text-lg:   1.125rem;
  --text-xl:   1.25rem;
  --text-2xl:  1.5rem;
  --text-3xl:  1.875rem;
  --text-4xl:  2.25rem;
  --text-5xl:  3rem;
  --text-6xl:  3.75rem;

  /* ── Font Weights ───────────────────────────────────────────────── */
  --font-normal:   400;
  --font-medium:   500;
  --font-semibold: 600;
  --font-bold:     700;
  --font-extrabold: 800;

  /* ── Line Heights ───────────────────────────────────────────────── */
  --leading-tight:   1.25;
  --leading-snug:    1.375;
  --leading-normal:  1.5;
  --leading-relaxed: 1.625;
  --leading-loose:   2;

  /* ── Border Radius ─────────────────────────────────────────────── */
  --radius-sm:   4px;
  --radius:      8px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-xl:   16px;
  --radius-2xl:  24px;
  --radius-full: 9999px;

  /* ── Shadows ────────────────────────────────────────────────────── */
  --shadow-sm:   0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow:      0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --shadow-md:   0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg:   0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --shadow-xl:   0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);

  /* ── Transitions ────────────────────────────────────────────────── */
  --transition-fast:   100ms ease;
  --transition:        150ms ease;
  --transition-slow:   300ms ease;
  --transition-spring: 300ms cubic-bezier(0.34, 1.56, 0.64, 1);

  /* ── Z-Index Scale ──────────────────────────────────────────────── */
  --z-below:    -1;
  --z-base:      0;
  --z-raised:    10;
  --z-dropdown:  20;
  --z-sticky:    30;
  --z-overlay:   40;
  --z-modal:     50;
  --z-toast:     60;
  --z-tooltip:   70;

  /* ── Container Sizes ────────────────────────────────────────────── */
  --container-sm:  640px;
  --container-md:  768px;
  --container-lg:  1024px;
  --container-xl:  1280px;
  --container-2xl: 1536px;

  /* ── Neutral Colors ────────────────────────────────────────────── */
  --color-bg:           #ffffff;
  --color-bg-secondary: #f8fafc;
  --color-bg-tertiary:  #f1f5f9;
  --color-surface:      #ffffff;
  --color-border:       #e2e8f0;
  --color-border-hover: #cbd5e1;

  --color-text:         #0f172a;
  --color-text-muted:   #64748b;
  --color-text-subtle:  #94a3b8;
  --color-text-inverse: #ffffff;
}

/* ── Dark Mode Overrides ────────────────────────────────────────── */
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg:           #0f172a;
    --color-bg-secondary: #1e293b;
    --color-bg-tertiary:  #334155;
    --color-surface:      #1e293b;
    --color-border:       #334155;
    --color-border-hover: #475569;

    --color-text:         #f1f5f9;
    --color-text-muted:   #94a3b8;
    --color-text-subtle:  #64748b;

    --shadow-sm:  0 1px 2px 0 rgb(0 0 0 / 0.3);
    --shadow:     0 1px 3px 0 rgb(0 0 0 / 0.4), 0 1px 2px -1px rgb(0 0 0 / 0.4);
    --shadow-md:  0 4px 6px -1px rgb(0 0 0 / 0.4), 0 2px 4px -2px rgb(0 0 0 / 0.4);
    --shadow-lg:  0 10px 15px -3px rgb(0 0 0 / 0.4), 0 4px 6px -4px rgb(0 0 0 / 0.4);
    --shadow-xl:  0 20px 25px -5px rgb(0 0 0 / 0.4), 0 8px 10px -6px rgb(0 0 0 / 0.4);
  }
}`,
  ].join("\n");
}
