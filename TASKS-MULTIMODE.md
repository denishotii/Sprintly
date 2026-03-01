# Tasks: Universal Multi-Mode Agent

Expand the agent from a website-only builder into a universal code generator that handles websites, React apps, Python projects, Node.js projects, and text responses.

**Principle:** Keep the existing website builder untouched (it works great). Add new modes alongside it. The planner routes to the right mode, and each mode has its own prompt, file structure, and validation.

---

## Current State

Right now the agent has 2 modes: `code` (always HTML/CSS/JS website) and `text`. The shared rules explicitly say "no React, no Vue, no npm install, no server." If the prompt asks for anything other than a static website, the agent either refuses or produces the wrong thing.

## Target State

6 modes, each with its own builder prompt, file expectations, and verification:

| Mode | When | Entry Point | Design System CSS? | Example |
|------|------|-------------|-------------------|---------|
| `website` | Landing pages, portfolios, static sites | `index.html` | Yes | "Build a landing page for my coffee shop" |
| `web-app` | Interactive apps with heavy JS | `index.html` | Yes | "Create a task management app" |
| `react-app` | Prompt says React, Vue, or a framework | `index.html` | No | "Create a React todo app with TypeScript" |
| `python` | Python scripts, Flask/Django apps | `main.py` or `app.py` | No | "Generate a Python script that scrapes weather data" |
| `node` | Node.js scripts, Express, CLI tools | `index.js` or `app.js` | No | "Build a Node.js CLI that converts CSV to JSON" |
| `text` | Writing, summaries, analysis | None | No | "Write me a haiku about autumn" |

## Architecture

```
Job Prompt
    |
    v
PLANNER (classifies into one of 6 modes, outputs JSON plan)
    |
    v
BUILDER (picks the right system prompt for the mode, generates files)
    |           |           |           |           |
    v           v           v           v           v
 website    web-app    react-app    python      node
 (existing) (existing)  (new)       (new)       (new)
    |           |           |           |           |
    v           v           v           v           v
VERIFIER (mode-aware: HTML checks for web, entry-point checks for scripts)
    |
    v
ZIP + SUBMIT
```

---

## Tasks

Unassigned. Dependencies marked so you know the order.

---

### M1 — Expand Types to Support 6 Modes

**Priority:** P0 (everything else depends on this)
**Depends on:** nothing
**Files:** `src/pipeline/types.ts`

The `PlanResult.mode` type is currently `"code" | "text"`. Every other file checks this type to decide what to do. We need to expand it to 6 values.

**What to do:**
- [ ] Change `PlanResult.mode` from `"code" | "text"` to `"website" | "web-app" | "react-app" | "python" | "node" | "text"`
- [ ] Export this as a named type: `export type ProjectMode = "website" | "web-app" | "react-app" | "python" | "node" | "text";`
- [ ] Add a helper constant for "web modes" (modes that produce HTML): `export const WEB_MODES: ProjectMode[] = ["website", "web-app", "react-app"];`
- [ ] Add a helper constant for "script modes": `export const SCRIPT_MODES: ProjectMode[] = ["python", "node"];`
- [ ] Add `runtime` field to `PlanTechStack`: `runtime: "browser" | "python" | "node"`
- [ ] Expand `interactivity` options: add `"react"` and `"vue"` to the union
- [ ] Expand `dataStorage` options: add `"sqlite"` and `"filesystem"` to the union
- [ ] Update `PipelineResult.mode` from `"code" | "text"` to `ProjectMode`

---

### M2 — Rewrite the Planner Prompt for 6 Modes

**Priority:** P0
**Depends on:** M1 (needs the new mode type names)
**Files:** `src/prompts/planner.ts`

The planner prompt currently only knows "code" and "text". It needs to classify into all 6 modes and produce the right file list for each.

**What to do:**
- [ ] Replace `"mode": "code" | "text"` in the JSON schema with the 6 new mode values
- [ ] Add classification guidance — tell the LLM how to pick the right mode:
  - `website`: prompt asks for a page, site, or landing page without heavy interactivity
  - `web-app`: prompt asks for an interactive app (task manager, dashboard, calculator, quiz) but doesn't mention a framework
  - `react-app`: prompt explicitly mentions React, Vue, Angular, Next.js, or similar
  - `python`: prompt mentions Python, Flask, Django, scraping, data processing, or asks for a `.py` file
  - `node`: prompt mentions Node.js, Express, npm, CLI tool, or asks for a `.js`/`.ts` server/tool
  - `text`: prompt asks for writing, summarizing, tweeting, emailing — no code project
- [ ] Update the file rules per mode:
  - `website` / `web-app`: must include `index.html` + `README.md` (current behavior)
  - `react-app`: must include `index.html` + `README.md` (React loaded via CDN, no build step)
  - `python`: must include entry point (`main.py` or `app.py`) + `requirements.txt` + `README.md`. NO `index.html`.
  - `node`: must include entry point (`index.js` or `app.js`) + `package.json` + `README.md`. NO `index.html`.
  - `text`: `files` should be empty `[]`
- [ ] Add `runtime` to the techStack schema output
- [ ] Add 2 new JSON examples:
  - Python example: "Generate a Python script that scrapes weather data" → mode `python`, files `main.py`, `requirements.txt`, `README.md`
  - React example: "Create a React todo app" → mode `react-app`, files `index.html`, `README.md`, `scripts/app.jsx`
- [ ] Keep the existing website and quiz examples but change their mode from `"code"` to `"website"` and `"web-app"` respectively

---

### M3 — Make Shared Rules Mode-Aware

**Priority:** P0
**Depends on:** M1 (needs `ProjectMode` type)
**Files:** `src/prompts/shared.ts`

The shared prompt fragments (`TECH_STACK_RULES`, `OUTPUT_STRUCTURE`, etc.) are currently hardcoded for websites. We need them to adapt based on the mode.

**What to do:**
- [ ] Keep the existing constants (don't break imports) but add new function versions:
  - `getTechStackRules(mode: ProjectMode): string`
  - `getOutputStructure(mode: ProjectMode): string`
- [ ] `getTechStackRules` returns:
  - For `website` / `web-app`: current rules (CDN only, no build step, Tailwind + Alpine)
  - For `react-app`: similar to website but allow React 18 + ReactDOM + Babel Standalone via CDN. Allow Tailwind CDN alongside. Still must work by opening `index.html` — no build step.
  - For `python`: "Generate complete, runnable Python 3.10+ code. Include requirements.txt listing all third-party packages. Use type hints. Add docstrings to public functions. Include `if __name__ == '__main__':` guard in entry point."
  - For `node`: "Generate complete, runnable Node.js 18+ code. Include package.json with name, version, description, main, scripts (start), and dependencies. Use ES modules (import/export) with `\"type\": \"module\"` in package.json. Include error handling."
- [ ] `getOutputStructure` returns:
  - For `website` / `web-app`: current structure (index.html, styles/main.css auto-injected, README.md)
  - For `react-app`: `index.html` (entry point, loads React via CDN), `scripts/app.jsx` (React components), `README.md`
  - For `python`: `main.py` (or `app.py`), `requirements.txt`, `README.md`, optional `utils/`, `data/`
  - For `node`: `index.js` (or `app.js`), `package.json`, `README.md`, optional `src/`, `utils/`
- [ ] Add `PERFORMANCE_RULES` constant (new — for web modes only):
  ```
  ## Performance (Judges evaluate site load speed)
  - Only load CDN libraries the project actually uses
  - Add loading="lazy" to images below the fold
  - Use <link rel="preconnect"> for Google Fonts and CDN origins
  - Defer non-critical scripts: <script defer src="...">
  - Minimize DOM depth — clean semantic HTML loads faster
  - Use font-display: swap for Google Fonts
  ```
- [ ] Add approved CDN URLs for React mode:
  ```
  React 18:        https://unpkg.com/react@18/umd/react.production.min.js
  ReactDOM 18:     https://unpkg.com/react-dom@18/umd/react-dom.production.min.js
  Babel Standalone: https://unpkg.com/@babel/standalone/babel.min.js
  ```

---

### M4 — Add Builder Prompts for React, Python, Node

**Priority:** P0
**Depends on:** M3 (needs mode-aware shared rules)
**Files:** `src/prompts/builder.ts`

The current `BUILDER_SYSTEM_PROMPT` is excellent for websites. We need equivalent quality prompts for the other modes.

**What to do:**
- [ ] Rename current `BUILDER_SYSTEM_PROMPT` to `WEBSITE_BUILDER_PROMPT` (keep the old name as an alias for backward compat)
- [ ] Add `PERFORMANCE_RULES` to the website/web-app builder prompt (from M3)
- [ ] Create `REACT_BUILDER_PROMPT`:
  - Persona: expert React developer building browser-ready apps
  - Load React 18, ReactDOM 18, and Babel Standalone via CDN
  - JSX goes in `<script type="text/babel">` tags
  - Component-based architecture with hooks (useState, useEffect, useRef, etc.)
  - Can use Tailwind CDN for styling alongside React
  - Teach it the `index.html` structure: load CDN scripts, then `<div id="root">`, then `<script type="text/babel" src="scripts/app.jsx">`
  - State management: React hooks for simple state, teach useReducer for complex state
  - Stress: everything must work by opening `index.html` — NO npm, NO webpack, NO vite
  - Include the `create_project` tool usage instructions
  - Include `PERFORMANCE_RULES`
- [ ] Create `PYTHON_BUILDER_PROMPT`:
  - Persona: expert Python developer writing clean, production-quality scripts
  - Code style: PEP 8, type hints, docstrings, meaningful variable names
  - Error handling: try/except with specific exceptions, helpful error messages
  - Entry point: `if __name__ == '__main__':` guard
  - requirements.txt: list all third-party imports with version pins
  - For Flask/Django apps: include clear route structure, templates if needed
  - For scripts: argparse for CLI args, logging module for output
  - Include the `create_project` tool usage instructions
- [ ] Create `NODE_BUILDER_PROMPT`:
  - Persona: expert Node.js developer writing clean, modern JavaScript/TypeScript
  - Use ES modules (`import`/`export`) with `"type": "module"` in package.json
  - package.json: include `name`, `version`, `main`, `scripts.start`, `dependencies`
  - Error handling: try/catch, process.exit codes, helpful error messages
  - For Express apps: clean route structure, middleware, error middleware
  - For CLI tools: use `process.argv` or a CLI parser, help text
  - Include the `create_project` tool usage instructions
- [ ] Create `getBuilderPromptForMode(mode: ProjectMode): string` function that returns the right prompt

---

### M5 — Update Builder Pipeline to Route by Mode

**Priority:** P0
**Depends on:** M4 (needs the new builder prompts), M1 (needs mode types)
**Files:** `src/pipeline/builder.ts`

The builder currently always injects CSS and always expects `index.html`. It needs to adapt its behavior based on the mode.

**What to do:**
- [ ] Import `getBuilderPromptForMode` from prompts and `ProjectMode`, `WEB_MODES` from types
- [ ] Replace the hardcoded `BUILDER_SYSTEM_PROMPT` with `getBuilderPromptForMode(plan.mode)`
- [ ] Only inject design system CSS when mode is in `WEB_MODES` AND mode is not `react-app`:
  ```typescript
  const shouldInjectCSS = ["website", "web-app"].includes(plan.mode);
  ```
  (React apps handle their own styling)
- [ ] Make README auto-generation mode-aware. Create a `generateReadmeForMode` function:
  - `website` / `web-app` / `react-app`: "Open `index.html` in any modern browser. No installation required."
  - `python`: "**Prerequisites:** Python 3.10+\n**Install:** `pip install -r requirements.txt`\n**Run:** `python main.py`"
  - `node`: "**Prerequisites:** Node.js 18+\n**Install:** `npm install`\n**Run:** `npm start`"
- [ ] The `extractFilesFromToolCalls` function doesn't need changes (it's already mode-agnostic)
- [ ] The text-mode path (`plan.mode === "text"`) stays exactly the same

---

### M6 — Update Planner Pipeline (Parser + Fallbacks)

**Priority:** P0
**Depends on:** M1 (needs mode types)
**Files:** `src/pipeline/planner.ts`

The planner parser currently only accepts `"code"` and `"text"` and always forces `index.html` into the file list. It needs to accept all 6 modes and have mode-specific fallbacks.

**What to do:**
- [ ] Import `ProjectMode`, `WEB_MODES`, `SCRIPT_MODES` from types
- [ ] In `parsePlanResponse`: change the mode validation from `["code", "text"]` to all 6 valid modes
- [ ] In `parsePlanResponse`: only force `index.html` and `styles/main.css` for web modes (`WEB_MODES`)
- [ ] For python mode: ensure `requirements.txt` and `README.md` exist in files. If no entry point, add `main.py`.
- [ ] For node mode: ensure `package.json` and `README.md` exist in files. If no entry point, add `index.js`.
- [ ] Update `fallbackPlan` to accept an optional hint from the prompt:
  - If prompt mentions "python" or "flask" or "django" → fallback to python mode with `main.py` + `requirements.txt` + `README.md`
  - If prompt mentions "node" or "express" or "npm" → fallback to node mode with `index.js` + `package.json` + `README.md`
  - If prompt mentions "react" or "vue" → fallback to react-app mode with `index.html` + `scripts/app.jsx` + `README.md`
  - Otherwise → fallback to website mode (current behavior, just change `"code"` to `"website"`)

---

### M7 — Make Verifier Mode-Aware

**Priority:** P1
**Depends on:** M1 (needs mode types), M5 (builder outputs the right files per mode)
**Files:** `src/pipeline/verifier.ts`

The verifier currently only checks for HTML structure (DOCTYPE, head, body, viewport, link/script refs). These checks are wrong for Python and Node projects.

**What to do:**
- [ ] Change `validateFiles` signature to accept mode: `validateFiles(files: ProjectFile[], mode: ProjectMode): ValidationReport`
- [ ] For web modes (`website`, `web-app`, `react-app`): keep all existing HTML checks as-is
- [ ] For `python` mode, replace HTML checks with:
  - Entry point exists: `main.py` or `app.py` (at least one)
  - `requirements.txt` exists
  - `README.md` exists and has content
  - No empty files
  - Basic Python syntax check: every `def` and `class` has a colon, no obvious `SyntaxError` patterns
- [ ] For `node` mode, replace HTML checks with:
  - Entry point exists: `index.js`, `app.js`, or a file matching `package.json`'s `main` field
  - `package.json` exists and is valid JSON
  - `README.md` exists and has content
  - No empty files
- [ ] Update `runVerifier` to accept and pass mode: `runVerifier(jobPrompt, files, mode)`

---

### M8 — Update Verifier Prompt for Non-Web Modes

**Priority:** P1
**Depends on:** M1 (needs mode types)
**Files:** `src/prompts/verifier.ts`

The verifier LLM prompt currently says "you are a senior front-end engineer" and only talks about HTML/CSS/JS. This doesn't make sense for Python/Node projects.

**What to do:**
- [ ] Convert `VERIFIER_SYSTEM_PROMPT` from a constant to a function: `getVerifierPrompt(mode: ProjectMode): string`
- [ ] Keep the old constant as a backward-compat alias: `export const VERIFIER_SYSTEM_PROMPT = getVerifierPrompt("website");`
- [ ] For web modes (`website`, `web-app`, `react-app`): return the current prompt (no changes)
- [ ] For `python` mode: "You are a senior Python developer performing a final code review. Check for: syntax errors, missing imports, broken references between modules, unhandled exceptions, missing requirements.txt entries, missing `if __name__` guard. Fix any issues found."
- [ ] For `node` mode: "You are a senior Node.js developer performing a final code review. Check for: syntax errors, missing require/import statements, broken module references, unhandled promise rejections, invalid package.json, missing dependencies. Fix any issues found."
- [ ] Same JSON output format for all modes (status, issuesFound, fixedFiles)

---

### M9 — Update Pipeline Orchestrator

**Priority:** P0
**Depends on:** M5 (builder), M7 (verifier), M6 (planner)
**Files:** `src/pipeline/index.ts`

The orchestrator needs to pass mode information through the pipeline and handle the new mode values correctly.

**What to do:**
- [ ] Import `ProjectMode`, `WEB_MODES` from types
- [ ] Update `isLikelyTextOnlyPrompt`: add `python|node|flask|django|express|npm|react|vue` to the `codeLike` regex so these prompts don't get classified as text
- [ ] Update `SYNTHETIC_TEXT_PLAN`: change `mode: "text"` stays the same (text mode didn't change)
- [ ] Pass `plan.mode` to `runVerifier`: change `runVerifier(jobPrompt, buildResult.files)` to `runVerifier(jobPrompt, buildResult.files, plan.mode)`
- [ ] Update the text-mode check: `plan.mode === "text"` stays the same (text is still text)
- [ ] Update `buildSubmissionMessage` to be mode-aware:
  - For web modes: "Extract the zip and open `index.html` in any modern browser."
  - For python: "Extract the zip. Install dependencies with `pip install -r requirements.txt`, then run `python main.py`."
  - For node: "Extract the zip. Install dependencies with `npm install`, then run `npm start`."
- [ ] Update `PipelineResult.mode` references: the result now returns the specific mode (`"website"`, `"python"`, etc.) instead of just `"code"`

---

### M10 — Update Prompt Exports and Assembly Helpers

**Priority:** P0
**Depends on:** M4 (new prompts exist), M8 (verifier prompt function)
**Files:** `src/prompts/index.ts`

The index file exports all prompts and has helper functions for assembling user messages. These need to be updated for multi-mode.

**What to do:**
- [ ] Export the new prompts: `REACT_BUILDER_PROMPT`, `PYTHON_BUILDER_PROMPT`, `NODE_BUILDER_PROMPT`
- [ ] Export `getBuilderPromptForMode` and `getVerifierPrompt`
- [ ] Export `getTechStackRules`, `getOutputStructure` from shared
- [ ] Update `assembleBuilderUserMessage` to include `runtime` in the tech stack section
- [ ] Make the builder user message include mode context: add `Mode: ${plan.mode}` to the execution plan section so the builder knows which kind of project it's building
- [ ] The verifier and planner user message helpers don't need mode changes (mode is conveyed through the system prompt)

---

### M11 — Update Runner for New Mode Values

**Priority:** P1
**Depends on:** M9 (orchestrator returns new mode values)
**Files:** `src/agent/runner.ts`

The runner currently checks `result.mode === "code"` to decide whether to upload a zip. With 6 modes, it needs to check `result.mode !== "text"` instead.

**What to do:**
- [ ] Change `result.mode === "code"` check (line ~484) to `result.mode !== "text"`
- [ ] Change `result.mode === "text"` check (line ~455) — this one stays the same
- [ ] The rest of the runner logic (upload, submit, cleanup) works the same for all file-producing modes
- [ ] That's it — small change, but necessary

---

### M12 — Add E2E Test Prompts for New Modes

**Priority:** P1
**Depends on:** M9 (full pipeline works with new modes)
**Files:** `src/cli/commands/e2e-prompts.ts`

Add test prompts so we can verify each mode works end-to-end with `npm run cli simulate -- --test <key>`.

**What to do:**
- [ ] Add `react` test prompt: "Create a React todo app with add, complete, and delete functionality"
- [ ] Add `python` test prompt: "Generate a Python script that fetches current weather data for a given city using the OpenWeatherMap API"
- [ ] Add `node` test prompt: "Build a Node.js CLI tool that reads a CSV file and converts it to JSON"
- [ ] Add `flask` test prompt: "Build a Python Flask web app with a REST API for managing a todo list"
- [ ] Add `express` test prompt: "Build a Node.js Express API with CRUD endpoints for managing books"
- [ ] Test each prompt manually and verify:
  - Planner classifies the correct mode
  - Builder produces the right file structure (no `index.html` in python mode, etc.)
  - Verifier runs the right checks
  - Zip contains the expected files

---

## Dependency Graph

```
M1 (Types) — start immediately, everything depends on it
    |
    ├── M2 (Planner Prompt)
    ├── M3 (Shared Rules)
    |       |
    |       └── M4 (Builder Prompts)
    |               |
    |               └── M5 (Builder Pipeline)
    |
    ├── M6 (Planner Pipeline)
    ├── M7 (Verifier)
    ├── M8 (Verifier Prompt)
    |
    └── M10 (Prompt Exports) — after M4 + M8
            |
            └── M9 (Orchestrator) — after M5 + M7 + M6
                    |
                    ├── M11 (Runner)
                    └── M12 (E2E Testing)
```

## Parallel Tracks for Two Devs

```
Dev A:  M1 → M2 → M6 → M7 → M9 → M11
        (types, planner prompt, planner pipeline, verifier, orchestrator, runner)

Dev B:  M3 → M4 → M5 → M8 → M10 → M12
        (shared rules, builder prompts, builder pipeline, verifier prompt, exports, testing)
```

Dev A starts with M1 (types) and shares the file immediately — Dev B can start M3 right after since it only needs the `ProjectMode` type name, not the full types file.

Both tracks converge at M9 (orchestrator) and M12 (testing).

## Key Design Decisions

**1. React via CDN, not npm:**
React apps use `unpkg.com/react@18`, `react-dom@18`, and `@babel/standalone` so the output still works by opening `index.html`. This matches the hackathon constraint (judge won't run npm install) while still producing real React apps.

**2. No CSS injection for react/python/node:**
The design system CSS (base.css, components.css) only gets injected for `website` and `web-app` modes. React apps handle their own styling (Tailwind CDN or inline). Python/Node have no HTML at all.

**3. Verifier adapts per mode:**
Web modes get HTML structure checks. Python gets import/syntax checks. Node gets package.json validation. The LLM verifier prompt also changes to match the language being reviewed.

**4. Same tools, different prompts:**
The `create_project` and `create_file` tools work for ANY file type — they just write bytes to disk and zip them. The intelligence is entirely in the system prompts, not the tools.

**5. Backward compatible:**
Existing `"code"` mode in old tests/code maps to `"website"`. The `BUILDER_SYSTEM_PROMPT` export name is kept as an alias. Nothing breaks for existing callers.
