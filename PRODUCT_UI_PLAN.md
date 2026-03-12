# Sprintly Product UI — Plan (short)

## Goal

Turn the marketing site into a product: **Landing** (showcase) → **Chat / Build UI** (user describes something, sees live app + code, can download). No iterative editing in v1 (Mode A).

---

## 1. Frontend

- **Landing** (`frontend/index.html`): Keep as-is. Point “Get Started” to the app page (e.g. `app.html`).
- **App** (e.g. `frontend/app.html`): ChatGPT-style chat. User types a prompt → backend returns result → show:
  - Short summary (text)
  - **Live preview**: main HTML in an iframe (blob URL from returned `files`)
  - **Code**: list of files with syntax highlighting
  - **Download ZIP**: build zip in browser from `files` (e.g. JSZip) or use server-provided zip

---

## 2. API (what the backend returns)

- **Endpoint**: `POST /api/build` — body: `{ prompt: string }`.
- **Return** (important):
  - `mode`, `textResponse`, `files: [{ path, content }]`
  - Optional: `zipUrl` or `zipBase64` for one-click download; otherwise frontend builds zip from `files`.

User always **sees the app in the iframe** before downloading. Zip is for download only.

---

## 3. Backend (current vs new)

- **Current `src/`**: Agent process for Seedstr (polls jobs, runs pipeline, submits). **No HTTP server.** Do not change the pipeline logic.
- **New**: Add an HTTP server (e.g. `src/server.ts`) that:
  - Exposes `POST /api/build`
  - Calls existing `runPipeline({ jobPrompt })`
  - Responds with JSON: `mode`, `textResponse`, `files` (and optionally zip).

Same repo, same pipeline; only a thin HTTP layer is added.

---

## 4. Repo layout (one repo)

```
Sprintly/
├── src/
│   ├── server.ts     # NEW — HTTP API
│   ├── pipeline/     # unchanged
│   └── ...
├── frontend/
│   ├── index.html    # landing
│   ├── app.html      # NEW — chat/build UI
│   └── ...
└── package.json      # add script for server
```

One repo. Split into more repos only if you need it later.

---

## 5. Build order

1. Add `src/server.ts` → `POST /api/build` → returns `files` + `textResponse` (+ optional zip).
2. Add `frontend/app.html` → chat UI, call API, show summary + code + iframe preview.
3. Add “Download ZIP” (client from `files` or from server zip).
4. Landing: link “Get Started” to app page.

Later: optional SSE (planning/building/verifying steps), then optional “edit” API with `previousFiles` for iterative edits.
