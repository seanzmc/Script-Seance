# Script Seance

Script Seance is a React + Node app for AI-assisted screenplay drafting, rewriting, and voice playback using OpenAI text generation through a server-side proxy.

## Current Status

The app is functional end-to-end and in active UI iteration.

- Setup flow with manual input or "Surprise Me" generation.
- Auth-gated AI requests (`/api/ai/*`) with session cookies, rate limits, and upstream timeout handling.
- Scene generation, plot-twist suggestions, targeted block rewrite, and insert workflows.
- Voice casting and script playback with cached TTS generation.
- Local draft autosave, undo/redo controls, and TXT/PDF export.
- Automated tests for core reliability paths (client services, playback engine, server error handling).

## Tech Stack

- React 19 + TypeScript
- Vite 6
- Express 5 API server
- OpenAI SDK (`openai`)
- Vitest + Testing Library

## Architecture at a glance

- Frontend orchestration is handled by `GenerationOrchestrator` (`services/orchestration/generationOrchestrator.ts`), called from `App.tsx`.
- LLM operations use latest-wins by `scopeKey`: a new run aborts the prior run in the same scope (`superseded`).
- Each run carries a receipt (`opId`, `opType`, `scopeKey`, `startedAt`, `status`, `metadata`). Commits only happen when the run is still active and `isFresh(...)` passes; stale/superseded outcomes are dropped.
- Orchestrator aborts are treated as expected control flow (silent from a user-error perspective), not hard failures.
- Text generation kinds are routed through `/api/ai/generate` and include `generateScene`, `suggestPlotTwist`, `generateScriptElement`, `regenerateScriptBlock`, and `generateSurpriseSetup` (`server/llm/types.js`).
- `generateScriptElement` uses a narrow `purpose` discriminator so title suggestion stays on the fast tier while insert-block generation uses the balanced tier.
- Prompt templates/builders live in `server/llm/promptBuilders.js`; per-kind execution/model/token handling is in `server/llm/textGeneration.js`.
- TTS uses `generateSpeech`/`listVoices` through the same API route. Playback, preview, and retry are driven by `hooks/useAudioPlayer.ts` + `services/scriptEngine.ts`, with cache keys in `services/ttsCacheKeys.ts`.

## Local setup

Prereqs:

- Node.js (LTS)
- pnpm

Copy `.env.example` to `.env`.

Minimal required env vars to run locally:

```bash
SCRIPT_SEANCE_OPENAI_API_KEY=...
ADMIN_PASSWORD=...
```

Common optional env vars:

- OpenAI defaults in `.env.example` use the GPT-5.4 family: `OPENAI_MODEL=gpt-5.4`, `OPENAI_BALANCED_MODEL=gpt-5.4-mini`, `OPENAI_FAST_MODEL=gpt-5.4-nano`.
- Use `SCRIPT_SEANCE_OPENAI_API_KEY` for this app's OpenAI server key so local usage is tracked to the project-specific credential.
- `ALLOWED_ORIGINS`: comma-separated allowed browser origins for mutating `/api/auth/*` and `/api/ai/*` requests.
- Inworld TTS requires `INWORLD_API_KEY`, `INWORLD_API_SECRET`, and `INWORLD_WORKSPACE_ID`.

`ALLOWED_ORIGINS` behavior:

- If unset, defaults to `http://localhost:3000,http://127.0.0.1:3000`.
- Non-allowlisted origins are rejected (`ORIGIN_NOT_ALLOWED`).
- In production, missing `Origin` on protected mutating routes is rejected (`ORIGIN_REQUIRED`).

Install and run:

```bash
pnpm install
pnpm start
```

Or run separately:

```bash
pnpm run server
pnpm run dev
```

Default local endpoints:

- Client: `http://localhost:3000`
- API: `http://localhost:3001`

## Debugging

Browser debug flags:

- `window.__SS_DEBUG_PROMPTS__ = true`
  - Enables client prompt-trace requests and shows the in-app Prompt Inspector in non-production builds.
  - Server-side prompt trace output also requires `SS_DEBUG_PROMPTS=1` (and non-production server mode).
- `window.__SS_DEBUG_AI_ABORTS__ = true`
  - Enables verbose abort/cancellation logs for AI/orchestrator flows in the browser console.

Example:

```js
window.__SS_DEBUG_PROMPTS__ = true;
window.__SS_DEBUG_AI_ABORTS__ = true;
```

## Docs

```bash
pnpm docs:typedoc   # build TypeDoc output into docs/typedoc
pnpm docs:serve     # serve docs/typedoc locally
pnpm docs:refresh   # regenerate typedoc + dependency graph (mermaid)
pnpm hooks:install  # configure git to use .githooks/pre-commit
```

The pre-commit hook conditionally runs:

- `pnpm docs:typedoc`
- `pnpm docs:graph:mermaid`

## Quality Checks

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

## Production Notes

- Keep OpenAI keys server-side only.
- Serve `dist/` and reverse-proxy `/api` to the Node server.
- Set `NODE_ENV=production` for secure cookies and production security headers.
- Configure HTTPS + security headers at the edge/proxy.
