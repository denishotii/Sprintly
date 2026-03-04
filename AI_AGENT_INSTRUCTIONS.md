# AI Agent Instructions for Sprintly

This file serves as a comprehensive guide for AI agents (like Copilot, Claude, or other AI assistants) working with the Sprintly codebase. Read this before diving into the source code.

## Project Overview

**Sprintly** (internally branded "Seed Agent") is an AI agent starter template for the Seedstr platform—a decentralized job marketplace where AI agents can autonomously accept jobs, process them, and earn cryptocurrency.

**Core Mission:** Enable AI agents to generate code projects and text responses for users while managing costs, tracking token usage, and submitting results back to the Seedstr platform.

### Key Capabilities
- Poll for new jobs from the Seedstr platform via REST API and WebSocket
- Process jobs through a 3-stage intelligent pipeline (Planner → Builder → Verifier)
- Generate complete code projects (websites, apps) with multiple files
- Generate text responses (copy, threads, articles, etc.)
- Track token usage, estimate costs, and manage budget constraints
- Submit responses with ZIP file attachments back to the platform
- Retry failed jobs and monitor submission status

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **Language** | TypeScript 5.7 |
| **Runtime** | Node.js ≥18 |
| **Build** | tsup (ES modules) |
| **Dev Tools** | tsx, Vitest |
| **LLM Integration** | Vercel AI SDK v6+ with Anthropic & OpenAI providers |
| **CLI Framework** | Commander.js |
| **Terminal UI** | React + Ink |
| **Validation** | Zod |
| **Real-time** | Pusher.js (WebSocket) |
| **File Handling** | Archiver (ZIP), fs |
| **Styling** | Chalk, Figlet |

---

## Directory Structure & Purpose

```
src/
├── agent/                 # Core agent orchestration
│   └── runner.ts         # AgentRunner class: job polling, processing, lifecycle management
│
├── api/                  # External API integration
│   └── client.ts         # SeedstrClient: platform API communication
│
├── cli/                  # Command-line interface
│   ├── index.ts          # Commander.js setup
│   └── commands/         # CLI commands (register, verify, run, simulate, etc.)
│
├── config/               # Configuration management
│   ├── index.ts          # .env + persistent config loading
│   └── modelCosts.ts     # Token pricing for different LLM models
│
├── llm/                  # Language model abstraction
│   ├── client.ts         # LLMClient: unified interface for all model calls
│   └── providers/        # Provider implementations (Anthropic, OpenAI)
│
├── pipeline/             # Job processing workflow
│   ├── planner.ts        # Step 1: Analyze task & plan approach
│   ├── builder.ts        # Step 2: Generate files or text response
│   ├── verifier.ts       # Step 3: Validate & auto-fix code
│   └── types.ts          # Pipeline interfaces
│
├── prompts/              # System prompts for each pipeline step
│   ├── planner.ts        # Prompt for planning phase
│   ├── builder.ts        # Prompt for code/text generation
│   ├── verifier.ts       # Prompt for validation & fixing
│   ├── textResponse.ts   # Prompt for text-only responses
│   └── shared.ts         # Shared utilities & formatting
│
├── tools/                # LLM tools (plugins available to models)
│   ├── webSearch.ts      # Web search via Tavily/DuckDuckGo
│   ├── calculator.ts     # Mathematical expressions
│   └── projectBuilder.ts # File creation & ZIP packaging
│
├── tui/                  # Terminal User Interface
│   └── index.tsx         # React-based real-time dashboard
│
├── types/                # Shared TypeScript interfaces
│   └── index.ts          # Central type definitions
│
├── utils/                # Utility functions
│   └── logger.ts         # Structured logging (debug, info, warn, error)
│
├── templates/            # Example data & test prompts
│   └── prompt-examples.ts
│
├── tests/                # Test suite
│   └── validation.test.ts
│
└── index.ts              # Main entry point
```

---

## How the System Works

### 1. Agent Lifecycle (src/agent/runner.ts)

The `AgentRunner` class orchestrates the entire agent:

```
START
  ↓
Load config & initialize LLM providers
  ↓
Connect to Seedstr API + WebSocket
  ↓
Poll for available jobs (30s interval by default)
  ↓
FOR EACH JOB:
  - Validate budget meets minimum threshold
  - Estimate LLM cost to determine affordability
  - Run job through 3-stage pipeline
  - Submit response via API
  - Track tokens & costs
  ↓
Monitor response status (accepted/rejected)
  ↓
UNTIL graceful shutdown (SIGINT/SIGTERM)
```

**Key Features:**
- **Circuit Breaker:** Stops polling after 5 consecutive API errors (exponential backoff)
- **WebSocket Support:** Real-time job notifications via Pusher for lower latency
- **Job Deduplication:** Tracks processed jobs to avoid reprocessing
- **Failed Job Retry:** Stores failed jobs locally for manual retry
- **Event System:** Emits events (`startup`, `job_found`, `response_submitted`, etc.) for UI updates

### 2. Job Processing Pipeline

Every job goes through exactly 3 steps:

#### **Step 1: Planner** (src/pipeline/planner.ts)
- **Input:** Raw user prompt
- **Decision:** Is this a code task or text-only task?
  - **Text Task:** Copy, tweet, blog, article → skip to text-only response
  - **Code Task:** Website, app, component → continue to Builder
- **Output:** Structured plan with tech stack decisions (CSS framework, JS library, storage, etc.)
- **Model:** `PLANNER_MODEL` (default: Claude Opus 4)

#### **Step 2: Builder** (src/pipeline/builder.ts)
- **For Text Tasks:** Generate plain text response (copy, tweet content, etc.)
- **For Code Tasks:** Generate complete file contents based on Planner's outline
  - Creates files in memory using the `ProjectBuilder` tool
  - Generates multi-file projects (HTML, CSS, JS, config files, etc.)
- **Output:** Either text string OR in-memory file collection
- **Model:** `BUILDER_MODEL` (default: Claude Sonnet 4)

#### **Step 3: Verifier** (src/pipeline/verifier.ts)
- **Validation:** Run fast programmatic checks first (syntax, structure, dependencies)
- **Correction:** If issues found, invoke LLM to automatically fix them
- **Output:** Corrected files or "ok" status
- **Model:** `VERIFIER_MODEL` (default: Claude Sonnet 4)

**Final Output:**
- For code: ZIP file with all generated files (sent to Seedstr)
- For text: Plain text string (sent to Seedstr)

### 3. LLM Integration (src/llm/client.ts)

The `LLMClient` provides a unified interface for all model calls with built-in resilience:

**Available Tools for Models:**
1. `web_search` - Real-time web searches (Tavily or DuckDuckGo)
2. `calculator` - Mathematical calculations
3. `create_file` - Create files in projects
4. `finalize_project` - Package and ZIP files

**Retry Strategy:**
- Catches transient errors: `InvalidToolArgumentsError`, `JSONParseError`, timeout errors
- Exponential backoff with jitter
- Configurable: `LLM_RETRY_MAX_ATTEMPTS` (default: 3), `LLM_RETRY_BASE_DELAY_MS` (default: 1000ms)
- Falls back to text-only response if all retries fail

**Provider Support:**
- Direct integration with Anthropic API (`@ai-sdk/anthropic`)
- Direct integration with OpenAI API (`@ai-sdk/openai`)
- Per-step model selection (Planner can use Opus, Builder/Verifier can use Sonnet)
- Automatic cost tracking and token counting

### 4. API Integration (src/api/client.ts)

The `SeedstrClient` handles all platform communication:

```typescript
// Job retrieval
const jobs = await client.listJobsV2()

// Job acceptance (if using shared budget)
await client.acceptJob(jobId)

// Response submission (code or text)
const response = await client.submitResponseV2(jobId, {
  text: "response content",
  files: ["url/to/file.zip"]
})

// File upload
const fileUrl = await client.uploadFile(zipBuffer)

// Status monitoring
const status = await client.getResponseStatus(jobId)
```

### 5. Configuration System (src/config/index.ts)

Two-layer config management:

**Persistent Layer** (stored locally with `conf` library):
- API Key (encrypted)
- Agent ID
- Wallet address
- Twitter verification status

**Runtime Layer** (.env file):
```env
# LLM Providers
PRIMARY_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-...
OPENAI_API_KEY=sk-...

# Pipeline Models
PLANNER_MODEL=claude-opus-4-6
BUILDER_MODEL=claude-sonnet-4-6
VERIFIER_MODEL=claude-sonnet-4-6

# Budget & Polling
MIN_BUDGET=0.50
MAX_CONCURRENT_JOBS=3
POLL_INTERVAL=30

# Tools
TOOL_WEB_SEARCH_ENABLED=true
TAVILY_API_KEY=...

# Logging
LOG_LEVEL=info
```

### 6. Terminal User Interface (src/tui/index.tsx)

React-based real-time dashboard (using Ink):

**Panels:**
- **Status Panel:** Running status, uptime, jobs processed/skipped/failed
- **Token Usage Panel:** Tokens used, estimated costs, cost per job
- **Activity Log:** Live feed of polling, job processing, responses
- **Controls:** `q` to quit, `r` to refresh

---

## CLI Commands Reference

```bash
npm run register       # Register agent with Seedstr, obtain API key
npm run verify        # Twitter verification (required to accept jobs)
npm run profile       # View/edit agent name, bio, profile picture
npm run status        # Check registration & verification state
npm start             # Start agent with TUI dashboard
npm run dev           # Development mode with hot reload
npm run simulate      # Local testing without hitting Seedstr API
npm run retry-job     # Retry a previously failed job by ID
npm run build         # Build TypeScript to dist/
npm test              # Run test suite
```

---

## Key Architectural Patterns

### 1. Event-Driven Design
The `AgentRunner` emits typed events that the TUI subscribes to:
```typescript
runner.on('job_found', (job) => { /* update UI */ })
runner.on('response_submitted', (data) => { /* track success */ })
runner.on('error', (error) => { /* log failure */ })
```

### 2. Modular Provider System
LLM providers (Anthropic, OpenAI) are swappable via a factory pattern:
- `src/llm/providers/index.ts` handles provider instantiation
- New providers can be added without changing the core pipeline

### 3. Type Safety First
- Full TypeScript with strict mode enabled
- Zod validation for all API responses
- Exhaustive type definitions in `src/types/index.ts`

### 4. Cost Estimation Engine
- `LLMClient` estimates token costs BEFORE processing jobs
- Checks if estimated cost ≤ available budget
- Skips jobs if unaffordable
- Tracks actual costs post-execution

### 5. Persistent Job Tracking
- Failed jobs stored in local config
- Allows manual retry without re-polling
- 7-day deduplication window to avoid infinite loops

### 6. Tool Integration Pattern
The `LLMClient` injects tools into model calls:
- Models can request tool execution (web_search, calculator, file_create)
- Client validates arguments and executes tools
- Results fed back to model for continuation
- Automatic retry on tool execution errors

---

## Common Tasks & Where to Find Code

| Task | Primary Files |
|------|---|
| Add a new CLI command | `src/cli/index.ts` + new file in `src/cli/commands/` |
| Add a new LLM tool | `src/tools/` + register in `src/llm/client.ts` |
| Add a new provider (Groq, Cohere, etc.) | `src/llm/providers/` + `src/config/modelCosts.ts` |
| Change pipeline behavior | `src/pipeline/index.ts` + individual step files |
| Modify system prompts | `src/prompts/` (one file per step) |
| Add new API endpoints | `src/api/client.ts` |
| Update job polling logic | `src/agent/runner.ts` |
| Customize TUI dashboard | `src/tui/index.tsx` |
| Add new configuration options | `src/config/index.ts` + `.env` |
| Improve error handling | `src/llm/client.ts` (retry logic) + error handlers in pipeline |

---

## Coding Conventions

### Type Definitions
All types are centralized:
```typescript
// Import from here
import type { Job, Response, ExecutionContext } from '@/types'
```

### Error Handling
1. Catch errors at I/O boundaries (API calls, LLM calls)
2. Use structured logging with levels: `debug`, `info`, `warn`, `error`
3. Retry transient errors in `LLMClient`
4. Emit `error` events from `AgentRunner` for aggregation

### Logging
```typescript
import { logger } from '@/utils'

logger.info('Processing job', { jobId, tokens: 5000 })
logger.warn('High cost job, budget may be insufficient', { jobId, cost: 12.50 })
logger.error('Failed to submit response', { jobId, error: err.message })
```

### Tool Registration
Add new tools to `src/tools/index.ts` and register with `LLMClient`:
```typescript
const tools = {
  new_tool: {
    description: "...",
    parameters: z.object({ /* ... */ }),
    execute: async (params) => { /* ... */ }
  }
}
```

---

## Important Files to Understand First

1. **src/types/index.ts** - Start here to understand all data structures
2. **src/agent/runner.ts** - Understand the main agent loop
3. **src/pipeline/index.ts** - Understand how jobs flow through the system
4. **src/llm/client.ts** - Understand LLM integration and error handling
5. **src/api/client.ts** - Understand Seedstr platform API
6. **src/config/index.ts** - Understand configuration system

---

## Current Development State

- **Active Branch:** `dona-branch`
- **Recent Work:** Text processing optimization (40s → 8s), model configuration updates
- **In Progress:** Retry job functionality, cost tracking improvements

**Staged Changes:**
- CODE_REVIEW.md (documentation)
- Multiple files updated: runner.ts, client.ts, cli/index.ts, etc.

**Untracked Files:**
- src/cli/commands/retry-job.ts (new feature being added)
- src/config/modelCosts.ts (new cost tracking module)

---

## Before You Start Working

1. **Read src/types/index.ts** to understand the data model
2. **Understand the 3-step pipeline** (Planner → Builder → Verifier)
3. **Know the difference between text and code tasks** (impacts entire pipeline)
4. **Familiarize yourself with LLMClient** for how model calls work
5. **Check .env.example** for available configuration options
6. **Run `npm run simulate`** to test locally without API calls

---

## Questions to Ask When Working on Features

- Is this a Planner, Builder, or Verifier step change?
- Does this affect cost calculation or budget validation?
- Should this be configurable via .env?
- Does this require a new LLM tool?
- Should this emit an event for the TUI to display?
- Is there a test for this behavior?

---

## Key Success Metrics

The agent's success is measured by:
1. **Job Acceptance Rate:** How many jobs it accepts successfully
2. **Token Efficiency:** Tokens used vs. budget available
3. **Quality Score:** User acceptance rate of generated responses
4. **Uptime:** How long the agent runs without crashes
5. **Cost Management:** Staying within budget while maximizing job quality

---

**Last Updated:** When this instructions file was created
**For Questions:** Refer to README.md or codebase comments
