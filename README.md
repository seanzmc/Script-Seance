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

UI polish and layout refinements are being tracked in `improve/ui_update_v2.md`.

## Tech Stack

- React 19 + TypeScript
- Vite 6
- Express 5 API server
- OpenAI SDK (`openai`)
- Google GenAI SDK (`@google/genai`) for Gemini TTS fallback
- Vitest + Testing Library

## Environment Variables

Copy `.env.example` to `.env` and set:

```bash
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-5.2
OPENAI_FAST_MODEL=gpt-5-nano
# Prompt cache retention: in-memory or 24h
OPENAI_PROMPT_CACHE_RETENTION=24h
OPENAI_SCENE_MAX_OUTPUT_TOKENS=2200
OPENAI_SCENE_MAX_OUTPUT_TOKENS_SHORT=1210
OPENAI_SCENE_MAX_OUTPUT_TOKENS_MEDIUM=2200
OPENAI_SCENE_MAX_OUTPUT_TOKENS_LONG=2970
OPENAI_MAX_OUTPUT_TOKENS_RETRY_CAP=5000
OPENAI_MAX_OUTPUT_TOKENS_RETRY_ATTEMPTS=2
TEXT_LLM_PROVIDER=openai
GEMINI_API_KEY=your_google_ai_studio_api_key_here
INWORLD_API_KEY=your_inworld_api_key_here
INWORLD_API_SECRET=your_inworld_api_secret_here
INWORLD_WORKSPACE_ID=your_inworld_workspace_id_here
ADMIN_PASSWORD=your_admin_password
PORT=3001
NODE_ENV=development
AI_RPM=30
AI_RPD=500
AI_MAX_PROMPT_CHARS=8000
AI_UPSTREAM_TIMEOUT_MS=30000
AI_UPSTREAM_TIMEOUT_MS_SCENE=90000
TRUST_PROXY=0
TTS_PROVIDER=dual
TTS_INWORLD_MODEL=inworld-tts-1.5-max
INWORLD_API_BASE=https://api.inworld.ai
INWORLD_ENGINE_HOST=api-engine.inworld.ai
VOICE_CATALOG_CACHE_TTL_MS=300000
INWORLD_MAX_ENGLISH_VOICES=8
INWORLD_JWT_REFRESH_BUFFER_MS=60000
```

`OPENAI_API_KEY` and `ADMIN_PASSWORD` are required for normal app usage.  
For Inworld TTS migration paths, set `INWORLD_API_KEY`, `INWORLD_API_SECRET`, and `INWORLD_WORKSPACE_ID`.
`GEMINI_API_KEY` is optional unless you use Gemini text fallback (`TEXT_LLM_PROVIDER=gemini`) or Gemini TTS.

## Local Development

Prereqs:

- Node.js (LTS)
- pnpm

Install:

```bash
pnpm install
```

Run both client and server:

```bash
pnpm start
```

Or run them separately:

```bash
pnpm run server
pnpm run dev
```

Default local endpoints:

- Client: `http://localhost:3000`
- API: `http://localhost:3001`

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
