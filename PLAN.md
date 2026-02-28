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
The seed-agent template is a solid foundation. It already handles:
- Platform integration: Registration, verification, job polling (REST + Pusher WebSocket)
- LLM calls: OpenRouter with retry logic + fallback to text-only
- Project builder: create_file + finalize_project tools that write files to disk and zip them
- File upload: Upload zip to Seedstr, submit with responseType: "FILE"
- Basic tools: Web search (Tavily/DDG), calculator, code analysis meta-tool
---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Job received from Seedstr (mystery prompt)             │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  STEP 1: PLANNER                              (~5s)     │
│                                                         │
│  - Classify task: code/project vs text-only             │
│  - If code → decide tech stack, enumerate all files     │
│  - If text → answer directly (unlikely for this hack)   │
│  - Output: structured plan JSON                         │
│    { mode, files[], techStack, description }            │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  STEP 2: BUILDER                             (~30-60s)  │
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
│  STEP 3: VERIFIER                            (~10-15s)  │
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

- **Speed is a judging criterion.** Every extra LLM round-trip adds 5–15s.
- A plan → build → verify pipeline covers all the bases without multi-agent debate overhead.
- The verifier is capped to **1 iteration** to protect speed.

---

## Design Decisions

### 1. No Model Router

A model router (GPT for X, Claude for Y, Llama for Z) sounds appealing but:
- Adds latency (classification step + potential retries on each model)
- Increases failure modes (timeouts, rate limits, inconsistent outputs)
- No benefit for a single blind prompt

**Decision:** One primary model via OpenRouter + fallback to a secondary only when the primary fails validation. Retry-with-fallback, not parallel calls.

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

## Implementation Priority

### P0 — Must Have (do first)

| Task | What | Impact |
|------|------|--------|
| **System prompts** | Expert-level prompts for planner, builder, verifier roles in `src/prompts/` | Single biggest quality lever — tells the LLM *how* to build good front-end code |
| **Batch file tool** | `create_project` tool that accepts `{ files: [{path, content}] }` in one call | Eliminates per-file round trips → much faster |
| **Auto README** | Always generate `README.md` with: what was built, file structure, how to open | Floor for Functionality score |
| **3-step pipeline** | Refactor `runner.ts` `processJob` into plan → build → verify | Better output quality and structure |

### P1 — Should Have (do second)

| Task | What | Impact |
|------|------|--------|
| **Verifier pass** | One-pass review of generated files: broken refs, missing files, HTML issues | Catches the dumb mistakes that tank Functionality score |
| **Default design system** | CSS variables, reset, typography, color palette injected as base template | Free Design score boost — every output looks polished |
| **Planner intelligence** | Better classification + file planning before generation | More coherent multi-file projects |

### P2 — Nice to Have (if time permits)

| Task | What | Impact |
|------|------|--------|
| **Text fallback** | Clean text-only response mode if the prompt isn't about code | Safety net |
| **Speed optimizations** | Streaming, parallel verification, smaller prompts | Speed score |
| **Model fallback** | Try Claude if GPT fails, or vice versa | Reliability |
| **Design templates** | Pre-built component library (nav, hero, cards, footer) the LLM can reference | Higher design quality |

### P3 — Stretch Goals

| Task | What | Impact |
|------|------|--------|
| **Screenshot generation** | Headless browser to capture a preview image of the built site | Judge appeal |
| **Lighthouse-style checks** | Basic accessibility + performance validation | Functionality edge case |

---

## File Changes Map

### Modified Files

| File | Changes |
|------|---------|
| `src/agent/runner.ts` | Refactor `processJob` into 3-step pipeline (plan → build → verify) |
| `src/llm/client.ts` | Add mode-aware system prompts, add `create_project` batch tool, increase `maxSteps` intelligence |
| `src/tools/projectBuilder.ts` | Add auto-README generation, basic HTML validation, batch file support |
| `src/config/index.ts` | Add config for planner/verifier model, prompt tuning knobs |

### New Files

| File | Purpose |
|------|---------|
| `src/prompts/planner.ts` | System prompt for the planner step — task classification + file planning |
| `src/prompts/builder.ts` | System prompt for the builder — expert front-end code generation |
| `src/prompts/verifier.ts` | System prompt for the verifier — code review + fix pass |
| `src/prompts/index.ts` | Prompt exports + shared prompt fragments |
| `src/templates/base.css` | Default CSS reset + design tokens (colors, typography, spacing) |
| `src/templates/index.ts` | Template loader — injects base CSS into projects |
| `src/pipeline/index.ts` | 3-step pipeline orchestrator (plan → build → verify) |
| `src/pipeline/planner.ts` | Planner step implementation |
| `src/pipeline/builder.ts` | Builder step implementation |
| `src/pipeline/verifier.ts` | Verifier step implementation |

---

## Model Strategy

```
Primary model (all steps)
        │
        ▼
   ┌─────────┐    success    ┌──────────┐
   │ Generate ├─────────────►│ Continue  │
   └────┬─────┘              └──────────┘
        │ failure
        ▼
   ┌──────────────┐   success   ┌──────────┐
   │ Retry (x3)   ├────────────►│ Continue  │
   │ same model   │             └──────────┘
   └────┬─────────┘
        │ still failing
        ▼
   ┌──────────────┐   success   ┌──────────┐
   │ Fallback     ├────────────►│ Continue  │
   │ alt model    │             └──────────┘
   └────┬─────────┘
        │ failure
        ▼
   ┌──────────────┐
   │ Text-only    │  (last resort — no tools)
   │ response     │
   └──────────────┘
```

Recommended models (via OpenRouter):
- **Primary:** `anthropic/claude-sonnet-4` — strong at code gen, fast, good tool use
- **Fallback:** `openai/gpt-4o` — different failure modes, strong generalist

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
- No model router overhead → direct generation

---

## Development Sequence

```
Week 1 (now → Mar 2):
  ├── Set up prompts/ directory with planner, builder, verifier prompts
  ├── Build batch create_project tool
  ├── Implement 3-step pipeline in runner
  └── Test with simulated prompts (npm run simulate)

Week 2 (Mar 2 → Mar 6):
  ├── Add verifier logic
  ├── Add default design system / CSS template
  ├── Tune system prompts based on test outputs
  ├── Speed optimization pass
  └── End-to-end testing with various prompt types

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
