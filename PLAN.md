# Sprintly — Development Plan

> Agent built for the [Seedstr Blind Hackathon](https://dorahacks.io/hackathon/seedstr/detail) ($10K prize pool).
> Mystery prompt drops **March 6–10, 2026**. Judged entirely by AI on **Functionality**, **Design**, and **Speed**.

---

## Hackathon Context

| Detail | Value |
|--------|-------|
| **What** | Blind prompt — agent receives an unknown task and must respond with a `.zip` |
| **Strong hint** | *"Build a well-rounded agent that can handle creating code/projects with a front-end."* |
| **Judging** | Seedstr's AI agent scores Functionality (gate: >5/10), then Design, then Speed |
| **Submission** | Files (`.zip`) + text uploaded via Seedstr API |
| **Timeline** | Building now → prompt drops Mar 6–10 → submission deadline Mar 9 |
| **Prizes** | 1st $5K · 2nd $3K · 3rd $2K (on-chain) |

### Key Constraint

The judge is an AI that reviews the zip contents. The output **must work by opening `index.html` in a browser** — no `npm install`, no build step, no server. All dependencies via CDN.

---

### What the Starter Template Gives Us

- Platform integration: Registration, verification, job polling (REST + Pusher WebSocket)
- Project builder: `create_file` + `finalize_project` tools that write files to disk and zip them
- File upload: Upload zip to Seedstr, submit with `responseType: "FILE"`
- Basic tools: Web search (Tavily/DDG), calculator, code analysis meta-tool

### What We're Changing

- **LLM provider**: Replacing OpenRouter with **direct OpenAI + Anthropic APIs** for lower latency, better control, and access to provider-specific features (Claude's extended thinking, GPT's structured outputs)
- **Architecture**: Adding a 3-step pipeline (plan → build → verify)
- **Tools**: Batch file creation instead of per-file round trips
- **Prompts**: Expert-level system prompts per pipeline step

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Job received from Seedstr (mystery prompt)             │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  STEP 1: PLANNER                                        │
│                                                         │
│  - Classify task: code/project vs text-only             │
│  - If code → decide tech stack, enumerate all files     │
│  - If text → answer directly (unlikely for this hack)   │
│  - Output: structured plan JSON                         │
│    { mode, files[], techStack, description }            │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  STEP 2: BUILDER                                        │
│                                                         │
│  - Takes plan + original prompt                         │
│  - Generates ALL files in one structured response       │
│    (batch creation — not one tool call per file)        │
│  - Injects default design system (CSS vars, reset)      │
│  - Always includes: index.html, README.md               │
│  - Modern CSS (Grid, Flexbox, custom properties)        │
│  - Responsive by default                                │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  STEP 3: VERIFIER                                       │
│                                                         │
│  - Reviews all generated files (1 pass, capped)         │
│  - Checks:                                              │
│    • HTML validity (basic structural checks)            │
│    • Missing files referenced in imports/links          │
│    • README completeness                                │
│    • Cross-file consistency                             │
│  - If issues: fix in this single pass (no loop)         │
│  - Finalize: zip → upload → submit                      │
└─────────────────────────────────────────────────────────┘
```

### Why 3 Steps, Not More

- **Speed is a judging criterion.** Every extra LLM round-trip adds real latency.
- A plan → build → verify pipeline covers all the bases without multi-agent debate overhead.
- The verifier is capped to **1 iteration** to protect speed.

---

## Tasks

See **[TASKS.md](TASKS.md)** for the full task board with subtask checklists and dependency graph.

---

## Design Decisions

### 1. Direct APIs, No Router

We use **OpenAI and Anthropic SDKs directly** — no OpenRouter middleman. Benefits:
- Lower latency (one fewer hop)
- Access to provider-specific features (Claude extended thinking, GPT structured outputs)
- Independent retry/fallback per provider
- Clearer error handling

**Decision:** One primary model + fallback to the other provider only when the primary fails. Retry-with-fallback, not parallel calls.

### 2. Front-End Focus Over General Modes

The hackathon explicitly says *"code/projects with a front-end."* Building robust Writer, Data, and Research modes is wasted effort. The mystery prompt will almost certainly be: **build some kind of web app/site**.

**Decision:** 80% of effort on making the Coder/Builder mode excellent for front-end web projects. A lightweight text fallback exists as a safety net.

### 3. Zero Build-Step Output

The AI judge reviews the zip. It won't run `npm install` or `webpack`. Everything must be self-contained.

**Decision:**
- HTML + CSS + vanilla JS (or Alpine.js/Petite-Vue via CDN)
- Tailwind CSS via CDN for rapid, consistent styling
- All dependencies loaded from CDNs (unpkg, cdnjs, jsdelivr)
- Single `index.html` entry point that works by double-clicking

### 4. Batch File Creation

The current starter template calls `create_file` once per file (1 LLM round-trip per file × 10+ files = slow). 

**Decision:** Replace with a `create_project` tool that accepts the entire file tree as a structured JSON array in one call. One round-trip for all files.

### 5. Universal Output Contract

No matter what the prompt is, the agent produces a consistent deliverable:

```
output.zip
├── index.html          # Entry point (always present)
├── styles/
│   └── main.css        # Styles (always present)
├── scripts/
│   └── app.js          # Application logic
├── assets/             # Images, icons, etc. (if applicable)
└── README.md           # What was built, how to use it
```

The judge always gets: an entry point, clean structure, and a README.

---

## Implementation Priority (Summary)

See **Task Board** above for full details and subtasks.

| Priority | Tasks | What |
|----------|-------|------|
| **P0** | T1, T2, T3, T4, T5, T6 | LLM client, config, prompts, batch tool, pipeline, runner integration |
| **P1** | T7, T8, T12 | Design system, file validation, end-to-end testing |
| **P2** | T9, T10, T11, T13 | Text fallback, component templates, speed optimization, model fallback |

---

## File Changes Map

### Modified Files

| File | Changes | Task |
|------|---------|------|
| `src/llm/client.ts` | Replace OpenRouter with dual-provider abstraction, update tool registry | T1 |
| `src/config/index.ts` | Add dual API key config, per-step model overrides | T2 |
| `src/tools/projectBuilder.ts` | Add batch file support, auto-README, validation | T4, T8 |
| `src/agent/runner.ts` | Replace `processJob` with pipeline call | T6 |
| `src/cli/commands/simulate.ts` | Update to use full pipeline | T12 |
| `package.json` | Swap `@openrouter/ai-sdk-provider` for `openai` + `@anthropic-ai/sdk` | T1 |
| `.env.example` | New env vars for both providers | T2 |

### New Files

| File | Purpose | Task |
|------|---------|------|
| `src/llm/providers/openai.ts` | OpenAI SDK wrapper | T1 |
| `src/llm/providers/anthropic.ts` | Anthropic SDK wrapper | T1 |
| `src/llm/providers/types.ts` | Shared `LLMProvider` interface | T1 |
| `src/prompts/planner.ts` | Planner system prompt | T3 |
| `src/prompts/builder.ts` | Builder system prompt | T3 |
| `src/prompts/verifier.ts` | Verifier system prompt | T3 |
| `src/prompts/shared.ts` | Shared prompt fragments | T3 |
| `src/prompts/index.ts` | Prompt exports | T3 |
| `src/pipeline/types.ts` | Pipeline type definitions | T5 |
| `src/pipeline/planner.ts` | Planner step implementation | T5 |
| `src/pipeline/builder.ts` | Builder step implementation | T5 |
| `src/pipeline/verifier.ts` | Verifier step implementation | T5, T8 |
| `src/pipeline/index.ts` | Pipeline orchestrator | T5 |
| `src/templates/base.css` | CSS reset + design tokens | T7 |
| `src/templates/components.css` | Utility component classes | T7 |
| `src/templates/index.ts` | Template loader | T7 |

---

## Model Strategy

Each pipeline step uses a specific model chosen for that step's job. Both providers accessed via direct SDKs (`@anthropic-ai/sdk`, `openai`) — no OpenRouter.

### Per-Step Model Assignment

| Step | Model | Provider | Why |
|------|-------|----------|-----|
| **Planner** | `claude-sonnet-4.6` | Anthropic | Fast (120 tok/s), smart, great at task classification. Output is small (~500 tokens) so speed is near-instant. |
| **Builder** | `claude-opus-4.6` | Anthropic | Best code quality available (SWE-bench leader), 128K max output tokens for large multi-file projects, best system prompt adherence for complex frontend constraints. |
| **Verifier** | `gpt-5.3-codex` | OpenAI | Different model family catches blind spots Claude might miss. Code-optimized, fast. |
| **Fallback (any step)** | `gpt-5.3-codex` | OpenAI | If Anthropic is down or rate-limited, Codex takes over. |

### Why Two Providers

Using a different model family for verification is intentional — it's like having a second person proofread rather than asking the author to check their own work. Claude builds, Codex reviews. Different reasoning = catches different issues.

### Fallback Flow

```
Step's assigned model
        │
        ▼
   ┌─────────┐    success    ┌──────────┐
   │ Generate ├─────────────►│ Continue  │
   └────┬─────┘              └──────────┘
        │ failure
        ▼
   ┌──────────────┐   success   ┌──────────┐
   │ Retry (x3)   ├────────────►│ Continue  │
   │ same model    │             └──────────┘
   └────┬─────────┘
        │ still failing
        ▼
   ┌──────────────┐   success   ┌──────────┐
   │ Fallback     ├────────────►│ Continue  │
   │ other provider│             └──────────┘
   └────┬─────────┘
        │ failure
        ▼
   ┌──────────────┐
   │ Text-only    │  (last resort — no tools)
   │ response     │
   └──────────────┘
```

### Budget

- **Anthropic credits:** $500 available (~160 full pipeline runs with Opus builder)
- **OpenAI credits:** $2,500 available (thousands of Codex runs)
- Both expire in 6 months — plenty of runway for development + competition

---

## System Prompt Strategy

The prompts are the #1 competitive advantage. Each step gets a tailored prompt:

### Planner Prompt (key points)
- Analyze the job prompt and classify task type
- Output a structured JSON plan: `{ mode, files[], techStack, description }`
- Be fast — this is a planning step, not a generation step
- Default to front-end web project unless clearly something else

### Builder Prompt (key points)
- You are an expert front-end developer
- All output must work by opening `index.html` — no build step
- Use CDN-based dependencies only
- Apply modern CSS (Grid, Flexbox, custom properties)
- Responsive design is mandatory
- Include semantic HTML, accessibility basics
- Follow the file plan from the planner
- Always create a `README.md`

### Verifier Prompt (key points)
- Review all generated files as a senior developer
- Check: HTML structure, CSS references, JS imports, broken links
- Check: does `index.html` exist? Does it reference all CSS/JS files correctly?
- Fix any issues found — output corrected files
- This is your ONE chance to fix problems — be thorough but fast

---

## Default Tech Stack

For the generated front-end projects:

| Layer | Choice | Why |
|-------|--------|-----|
| **Markup** | Semantic HTML5 | Universal, no build step |
| **Styling** | Tailwind CSS (CDN) + custom CSS | Fast development, consistent design, CDN = no build |
| **Interactivity** | Vanilla JS or Alpine.js (CDN) | Lightweight, no build step, sufficient for most UIs |
| **Icons** | Lucide or Heroicons (CDN) | Clean, modern icon set |
| **Fonts** | Google Fonts (Inter/Plus Jakarta Sans) | Professional typography via CDN |

### Design Defaults
- Dark/light mode support via CSS custom properties
- 4px base spacing scale
- Consistent border-radius (8px default)
- Smooth transitions (150ms ease)
- Mobile-first responsive breakpoints

---

## Scoring Optimization

How each decision maps to the judging criteria:

### Functionality (gate: must be >5/10)
- Universal output contract → always produces a working deliverable
- Auto-README → judge understands what was built
- Verifier pass → catches broken references before submission
- `index.html` entry point → always something to open

### Design
- Default design system → every output has a polished baseline
- Tailwind CSS → consistent, modern utility-based styling
- Responsive by default → works on any viewport
- Professional typography + spacing → looks intentional

### Speed
- Batch file creation → one round-trip instead of 10+
- 3-step pipeline (not 5+) → minimal LLM calls
- Verifier capped to 1 pass → no infinite loops
- Direct API calls (no OpenRouter middleman) → lower latency
- Sonnet for planning (fast), Opus for building (quality), Codex for verifying (fast + different perspective)

---

## Development Sequence

```
Phase 1 — Foundation (now → Mar 2):
  Dev A track:  T1 (LLM Client) → T2 (Config)
  Dev B track:  T3 (Prompts) → T4 (Batch Tool)
  Both tracks can start immediately, no conflicts.

Phase 2 — Pipeline (Mar 2 → Mar 4):
  Together:     T5 (Pipeline Orchestrator) → T6 (Runner Integration)
  These depend on Phase 1. Work together or split planner/builder/verifier.

Phase 3 — Polish (Mar 4 → Mar 6):
  Pick from:    T7 (Design System), T8 (Validation), T12 (Testing)
  Then:         T9, T10, T11, T13 if time allows

Mar 6–10 (prompt drops):
  ├── Agent is running, connected to Seedstr
  ├── Monitor for the mystery prompt
  └── Submit to DoraHacks after agent responds
```

---

## Quick Commands

```bash
npm start              # Run agent (production, with TUI)
npm run dev            # Run agent (dev mode, hot reload)
npm run simulate       # Test with simulated prompts
npm run status         # Check registration + verification
npm test               # Run test suite
```

---

## Links

- [Seedstr Hackathon](https://seedstr.io/hackathon)
- [Seedstr Docs](https://seedstr.io/docs)
- [DoraHacks Page](https://dorahacks.io/hackathon/seedstr/detail)
- [Seed Agent Template](https://github.com/seedstr/seed-agent)
- [Discord](https://discord.gg/H9DSeXsz)
