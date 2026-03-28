# Script Seance

Script Seance is a React + Express app for AI-assisted screenplay drafting. It supports guided story setup, scene generation, targeted rewrites and inserts, voice casting with TTS playback, local draft persistence, and TXT/PDF export through a server-side AI proxy.

## Current Status

The app is functional end to end and still in active UI iteration.

- Multi-step setup flow with genre, premise, character, style, length, and voice-preference inputs.
- Manual setup or AI-assisted "Surprise Me" setup generation.
- Title suggestion, scene generation, plot-twist suggestions, targeted block rewrite, and anchored insert generation.
- Voice catalog loading, per-character voice casting, playback preview, and cached TTS playback.
- Local draft hydration/autosave via `localStorage`, undo/redo controls, and TXT/PDF export.
- Password login flow with session cookies protecting `/api/ai/*` routes.
- Automated unit/integration coverage plus focused Playwright coverage for key UI flows.

## Tech Stack

- React 19 + TypeScript
- Vite 6
- Express 5
- OpenAI SDK (`openai`) for text generation
- Inworld APIs for TTS and voice catalog
- Tailwind CSS
- Motion (`motion/react`)
- Vitest + Testing Library
- Playwright

## Architecture At A Glance

- Frontend workspace state is coordinated by [`hooks/useStoryWorkspace.tsx`](hooks/useStoryWorkspace.tsx).
- AI request orchestration is handled by [`services/orchestration/generationOrchestrator.ts`](services/orchestration/generationOrchestrator.ts) with latest-wins behavior per `scopeKey`.
- Each orchestrated run carries a receipt (`opId`, `opType`, `scopeKey`, `startedAt`, `status`, `metadata`); stale or superseded results are ignored.
- Text-generation requests are routed through `/api/ai/generate` and currently support `generateScene`, `suggestPlotTwist`, `generateScriptElement`, `regenerateScriptBlock`, `generateSurpriseSetup`, `generateSpeech`, and `listVoices`.
- Prompt builders live in [`server/llm/promptBuilders.js`](server/llm/promptBuilders.js); per-kind model selection, token limits, and retry handling live in [`server/llm/textGeneration.js`](server/llm/textGeneration.js).
- `generateScriptElement` uses a `purpose` discriminator so title suggestions can stay on the fast model tier while insert generation uses the balanced tier.
- TTS playback, preview, and retry flow through [`hooks/useAudioPlayer.ts`](hooks/useAudioPlayer.ts) and [`services/scriptEngine.ts`](services/scriptEngine.ts), with cache-key helpers in [`services/ttsCacheKeys.ts`](services/ttsCacheKeys.ts).
- In production, the Express server also serves the built Vite app from `dist/`.

## Local Setup

Prerequisites:

- Node.js (current LTS recommended)
- `pnpm`

Copy `.env.example` to `.env`.

Minimum required env vars for basic local use:

```bash
SCRIPT_SEANCE_OPENAI_API_KEY=...
ADMIN_PASSWORD=...
```

Useful optional env vars:

- `OPENAI_MODEL`, `OPENAI_BALANCED_MODEL`, `OPENAI_FAST_MODEL`
  Defaults target the GPT-5.4 family in `.env.example`.
- `OPENAI_PROMPT_CACHE_RETENTION`
  Controls OpenAI prompt-cache retention behavior used by the server codepath.
- `OPENAI_SCENE_MAX_OUTPUT_TOKENS*`
  Scene-generation token caps, including per-length overrides.
- `AI_UPSTREAM_TIMEOUT_MS`, `AI_UPSTREAM_TIMEOUT_MS_SCENE`
  Upstream timeout controls for server-side AI requests.
- `AI_UPSTREAM_RETRY_*`
  Retry policy for transient upstream failures.
- `AI_RPM`, `AI_RPD`
  Per-session/IP AI rate limits.
- `AI_MAX_PROMPT_CHARS`
  Prompt-size guardrail before the server rejects a request.
- `ALLOWED_ORIGINS`
  Comma-separated browser origins allowed to call mutating `/api/auth/*` and `/api/ai/*` routes.
- `INWORLD_API_KEY`, `INWORLD_API_SECRET`, `INWORLD_WORKSPACE_ID`
  Required for live Inworld TTS generation and workspace voice imports.
- `TTS_INWORLD_MODEL`, `VOICE_CATALOG_CACHE_TTL_MS`, `INWORLD_MAX_ENGLISH_VOICES`
  TTS and voice-catalog tuning knobs.
- `PORT`, `NODE_ENV`, `TRUST_PROXY`
  Server bind port and deployment/security behavior.

`ALLOWED_ORIGINS` behavior:

- If unset, it defaults to `http://localhost:3000,http://127.0.0.1:3000`.
- Non-allowlisted origins are rejected with `ORIGIN_NOT_ALLOWED`.
- In production, missing `Origin` on protected mutating routes is rejected with `ORIGIN_REQUIRED`.

Install and run both client and server:

```bash
pnpm install
pnpm start
```

Run them separately if needed:

```bash
pnpm run server
pnpm run dev
```

Useful variants:

```bash
pnpm run start:debug
pnpm run server:debug
pnpm run dev:debug
pnpm run preview
```

Default local endpoints:

- Client: `http://localhost:3000`
- API: `http://localhost:3001`

## Debugging

Browser debug flags:

- `window.__SS_DEBUG_PROMPTS__ = true`
  Enables client prompt-trace requests and shows the in-app Prompt Inspector in non-production builds.
- `window.__SS_DEBUG_AI_ABORTS__ = true`
  Enables verbose abort/cancellation logs for AI/orchestrator flows in the browser console.

Server-side prompt tracing also requires `SS_DEBUG_PROMPTS=1`, which is what `pnpm run server:debug` and `pnpm run start:debug` enable.

Example:

```js
window.__SS_DEBUG_PROMPTS__ = true;
window.__SS_DEBUG_AI_ABORTS__ = true;
```

## Tests And Quality Checks

Core gates:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Additional useful checks:

```bash
pnpm build
pnpm test:playwright
```

## Docs And Hooks

```bash
pnpm docs:typedoc         # build TypeDoc output into docs/typedoc
pnpm docs:typedoc:watch   # watch TypeDoc output
pnpm docs:serve           # serve docs/typedoc locally
pnpm docs:graph:mermaid   # regenerate dependency graph source
pnpm docs:graph:svg       # render dependency graph SVG
pnpm docs:refresh         # regenerate typedoc + mermaid graph
pnpm docs:all             # alias for docs:refresh
pnpm hooks:install        # configure git to use .githooks/pre-commit
```

The pre-commit hook conditionally runs:

- `pnpm docs:typedoc`
- `pnpm docs:graph:mermaid`

## Production Notes

- Keep OpenAI and Inworld credentials server-side only.
- Set `NODE_ENV=production` for secure cookies and production-only security headers.
- Set `TRUST_PROXY=1` when running behind a trusted reverse proxy.
- Build the client with `pnpm build`; the Express server serves `dist/` in production.
- Configure HTTPS and any edge/proxy headers at the deployment layer.
