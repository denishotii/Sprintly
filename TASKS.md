# Tasks

Unassigned — pick what you want to work on.
Check the **Depends on** field before starting so you don't build on something that doesn't exist yet.

---

## T1 — Swap OpenRouter for OpenAI + Anthropic Direct APIs

**Priority:** P0
**Depends on:** nothing
**Files:** `src/llm/`, `package.json`

Right now the agent calls LLMs through OpenRouter (a proxy). We want to call OpenAI and Anthropic directly for lower latency and access to each provider's unique features.

**What to do:**
- [ ] Install the `openai` and `@anthropic-ai/sdk` npm packages
- [ ] Remove the `@openrouter/ai-sdk-provider` package
- [ ] Create `src/llm/providers/types.ts` — define a shared interface that both providers implement (a `generate()` method that accepts a prompt, system prompt, tools, and returns text + tool results + token usage)
- [ ] Create `src/llm/providers/openai.ts` — wrapper around the OpenAI SDK that implements the shared interface, including tool/function calling
- [ ] Create `src/llm/providers/anthropic.ts` — same thing for the Anthropic SDK
- [ ] Refactor `src/llm/client.ts` — instead of importing OpenRouter, it picks the right provider based on config and calls it through the shared interface
- [ ] Make sure the existing retry logic still works (retry on JSON parse errors, tool argument errors, etc.)
- [ ] Token usage tracking should work with both providers' response formats

---

## T2 — Update Config for Dual Providers

**Priority:** P0
**Depends on:** nothing
**Files:** `src/config/index.ts`, `.env.example`

The config currently expects a single `OPENROUTER_API_KEY`. We need it to support two separate providers.

**What to do:**
- [ ] Add new env vars: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
- [ ] Add `PRIMARY_PROVIDER` (value: `anthropic` or `openai`) — which provider to use by default
- [ ] Add `FALLBACK_PROVIDER` — which provider to try if the primary fails
- [ ] Add per-step model overrides: `PLANNER_MODEL`, `BUILDER_MODEL`, `VERIFIER_MODEL` (so we can use a fast model for planning and a powerful one for building)
- [ ] Update `.env.example` with all new variables and clear comments
- [ ] Startup validation: at least one API key must be provided, warn if fallback provider key is missing

---

## T3 — Write the System Prompts

**Priority:** P0
**Depends on:** nothing
**Files:** `src/prompts/` (new folder)

The system prompts tell the LLM *how* to do its job. This is the single biggest quality lever — a great prompt turns an average model into an excellent builder. We need three prompts, one per pipeline step.

**What to do:**
- [ ] Create `src/prompts/planner.ts` — tells the LLM to analyze the job prompt and output a structured JSON plan: what type of project, what files are needed, what tech stack to use. Should be concise — the planner needs to be fast, not creative.
- [ ] Create `src/prompts/builder.ts` — tells the LLM it's an expert front-end developer. Key rules to encode: everything must work by opening `index.html` (no build tools), use CDN dependencies only, responsive design is mandatory, semantic HTML, modern CSS, always include a README.md.
- [ ] Create `src/prompts/verifier.ts` — tells the LLM to act as a senior code reviewer doing a final check. Look for: broken file references, missing files, HTML structure issues, CSS/JS not linked properly. Fix anything found. This is the last chance before submission.
- [ ] Create `src/prompts/shared.ts` — reusable fragments that multiple prompts share (tech stack rules, output structure requirements, design defaults)
- [ ] Create `src/prompts/index.ts` — exports everything, plus a helper function that assembles a final prompt by combining the role prompt + shared fragments + job-specific context
- [ ] Include examples of expected output format in each prompt (the LLM performs better when it sees what "good" looks like)

---

## T4 — Batch File Creation Tool

**Priority:** P0
**Depends on:** nothing
**Files:** `src/tools/projectBuilder.ts`

Currently the LLM creates files one at a time (`create_file` tool call per file). For a 10-file project, that's 10+ round trips — slow. We want a single tool call that creates the entire project at once.

**What to do:**
- [ ] Add a `createBatch(files: ProjectFile[])` method to the `ProjectBuilder` class — accepts an array of `{path, content}` and writes them all at once
- [ ] Define a new `create_project` tool with a Zod schema that accepts `{ projectName: string, files: [{path: string, content: string}] }`
- [ ] Keep the existing `create_file` tool around (the verifier will use it to patch individual files)
- [ ] If the LLM doesn't include a `README.md` in the file list, auto-generate a basic one (project name, file list, "open index.html to view")
- [ ] Basic validation: reject empty file content, normalize path separators, catch duplicate file paths
- [ ] Register the new tool in the LLM client's tool list

---

## T5 — Build the 3-Step Pipeline

**Priority:** P0
**Depends on:** T1 (LLM client ready), T3 (prompts written)
**Files:** `src/pipeline/` (new folder)

This is the core brain of the agent. Instead of one big LLM call, we do three focused calls: plan what to build, build it, then verify it.

**What to do:**
- [ ] Create `src/pipeline/types.ts` — TypeScript types for: `PlanResult` (what the planner outputs), `BuildResult` (files created by builder), `VerifyResult` (fixes from verifier), `PipelineResult` (final output)
- [ ] Create `src/pipeline/planner.ts` — sends the job prompt to the LLM with the planner system prompt, parses the JSON plan that comes back (task type, file list, tech stack)
- [ ] Create `src/pipeline/builder.ts` — sends the original prompt + the plan to the LLM with the builder system prompt, collects all the generated files
- [ ] Create `src/pipeline/verifier.ts` — sends all file contents to the LLM with the verifier system prompt, gets back any fixes/patches
- [ ] Create `src/pipeline/index.ts` — the orchestrator that runs: planner → builder → verifier → zip the files → return the result
- [ ] Edge case: if the planner says "this is a text task, not a code task" → skip builder/verifier and just generate a text response
- [ ] Log how long each step takes (so we can see where time is spent)

---

## T6 — Connect the Pipeline to the Job Runner

**Priority:** P0
**Depends on:** T5 (pipeline), T4 (batch tool)
**Files:** `src/agent/runner.ts`

The runner currently calls `llm.generate()` directly when a job comes in. We need to swap that out for the new pipeline.

**What to do:**
- [ ] In `processJob()`, replace the inline `llm.generate()` call with something like `pipeline.execute(job)`
- [ ] If the pipeline returns files → zip them, upload to Seedstr, submit response with `responseType: "FILE"`
- [ ] If the pipeline returns text only → submit as a text response
- [ ] Keep everything else that already works: token tracking, cost estimation, event emission, error handling, SWARM job support, v2 API submission
- [ ] Add new event types for pipeline stages if useful for the TUI (e.g., `plan_complete`, `build_complete`, `verify_complete`)

---

## T7 — Default Design System (CSS)

**Priority:** P1
**Depends on:** nothing
**Files:** `src/templates/` (new folder)

Every project the agent builds should look polished out of the box. We create a default CSS foundation that gets included in every project.

**What to do:**
- [ ] Create `src/templates/base.css` — CSS reset + custom properties for: colors (primary, secondary, accent, neutrals, success/warning/error), spacing scale (4px base), typography scale, border-radius, shadows, transitions
- [ ] Create `src/templates/components.css` — common utility classes: card, button variants, container, grid helpers, responsive nav patterns
- [ ] Create `src/templates/index.ts` — reads the CSS files and exports them as strings so the pipeline can inject them into generated projects
- [ ] Support dark/light mode via `prefers-color-scheme` and CSS custom properties
- [ ] Use Google Fonts via CDN (Inter or similar professional font)
- [ ] Mobile-first responsive breakpoints (sm, md, lg, xl)

---

## T8 — File Validation (Non-LLM Checks)

**Priority:** P1
**Depends on:** T5 (pipeline exists)
**Files:** `src/pipeline/verifier.ts`, `src/tools/projectBuilder.ts`

Before we ask the LLM to verify, run fast programmatic checks. If everything passes, we can skip the LLM verifier entirely and save time.

**What to do:**
- [ ] Check that `index.html` exists
- [ ] Check that all `<link href="...">`, `<script src="...">`, `<img src="...">` references in HTML point to either a file in the project or a valid CDN URL
- [ ] Check that no file is empty
- [ ] Check that HTML has basic structure (`<!DOCTYPE html>`, `<html>`, `<head>`, `<body>`)
- [ ] Check that `README.md` exists and has content
- [ ] Return a validation report (list of issues found)
- [ ] Feed this report into the LLM verifier as context so it knows what to fix
- [ ] If zero issues found → skip the LLM verifier call (speed win)

---

## T9 — Text Fallback Mode

**Priority:** P2
**Depends on:** T5 (pipeline)
**Files:** `src/pipeline/planner.ts`, `src/pipeline/index.ts`

Safety net in case the mystery prompt turns out to be a text task (write an essay, summarize something, etc.) instead of a coding task.

**What to do:**
- [ ] When the planner classifies the task as `text` → pipeline skips the builder and verifier
- [ ] Generate a clean text response directly
- [ ] Format it nicely in markdown
- [ ] Submit as text-only (no file upload)

---

## T10 — Component Templates for the Builder Prompt

**Priority:** P2
**Depends on:** T7 (design system)
**Files:** `src/templates/`

Give the builder LLM examples of well-built UI components it can reference when generating code. These go in the system prompt as examples, not as injected code.

**What to do:**
- [ ] Responsive navigation bar (hamburger menu on mobile)
- [ ] Hero section (title, subtitle, CTA button)
- [ ] Card grid (responsive: 1 col on mobile, 2 on tablet, 3 on desktop)
- [ ] Footer (links, copyright, socials)
- [ ] Form layout (inputs, labels, validation states)
- [ ] Modal/dialog
- [ ] Add these as example snippets in the builder system prompt

---

## T11 — Speed Optimization

**Priority:** P2
**Depends on:** T5 (pipeline working end-to-end)
**Files:** `src/pipeline/`, `src/llm/`

Once everything works, find and eliminate wasted time. Speed is a judging criterion.

**What to do:**
- [ ] Measure how long each pipeline step takes on average
- [ ] Keep the planner prompt small (fast in, fast out)
- [ ] Set per-step `max_tokens` limits (planner needs ~1K, builder needs 8K+, verifier needs ~4K)
- [ ] If programmatic validation (T8) passes clean, skip the LLM verifier
- [ ] Look for any other bottlenecks (file I/O, zip creation, upload)

---

## T12 — End-to-End Testing

**Priority:** P1
**Depends on:** T6 (full pipeline wired into runner)
**Files:** `tests/`, `src/cli/commands/simulate.ts`

Test the agent with realistic prompts that are similar to what the mystery prompt might be.

**What to do:**
- [ ] Update the `simulate` CLI command to run the full pipeline (not just a raw LLM call)
- [ ] Create test prompts:
  - "Build a portfolio website for a photographer"
  - "Create a task management app"
  - "Build a weather dashboard"
  - "Create a landing page for a SaaS product"
  - "Build a quiz/trivia app"
- [ ] For each test: verify the zip has correct structure, `index.html` opens in a browser, no broken references, README exists
- [ ] Log total response time per prompt
- [ ] Fix anything that breaks

---

## T13 — Cross-Provider Fallback

**Priority:** P2
**Depends on:** T1 (dual LLM client)
**Files:** `src/llm/client.ts`

If the primary provider (e.g., Anthropic) fails even after retries, automatically switch to the fallback provider (e.g., OpenAI) for that request.

**What to do:**
- [ ] After 3 retries on the primary provider fail → try the same request on the fallback provider
- [ ] If the fallback also fails → fall back to text-only mode (no tools)
- [ ] Log which provider was used for each step
- [ ] Configurable: `FALLBACK_PROVIDER` env var, or auto-detect from which API keys are present

---

## Dependency Graph

```
Can start right now (no dependencies):
  T1, T2, T3, T4, T7

After T1 + T3 are done:
  T5 (pipeline)

After T5 is done:
  T6 (runner integration), T8 (validation), T9 (text fallback)

After T6 is done:
  T12 (testing)

After T7 is done:
  T10 (component templates)

After T5 is done:
  T11 (speed optimization)

After T1 is done:
  T13 (cross-provider fallback)
```

**Suggested parallel tracks:**

```
Dev A:  T1 → T2 → T5 → T6 → T12
Dev B:  T3 → T4 → T7 → T8 → T10
```

T9, T11, T13 are small — either dev picks them up when their main track is done.
