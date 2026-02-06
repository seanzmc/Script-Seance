# Script Seance

Script Seance is a React + Node app for AI-assisted screenplay drafting, rewriting, and voice playback using Gemini through a server-side proxy.

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
- Google GenAI SDK (`@google/genai`)
- Vitest + Testing Library

## Environment Variables

Copy `.env.example` to `.env` and set:

```bash
GEMINI_API_KEY=your_google_ai_studio_api_key_here
ADMIN_PASSWORD=your_admin_password
PORT=3001
NODE_ENV=development
AI_RPM=30
AI_RPD=500
AI_MAX_PROMPT_CHARS=8000
AI_UPSTREAM_TIMEOUT_MS=30000
TRUST_PROXY=0
```

`GEMINI_API_KEY` and `ADMIN_PASSWORD` are required for normal app usage.

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

- Keep Gemini keys server-side only.
- Serve `dist/` and reverse-proxy `/api` to the Node server.
- Set `NODE_ENV=production` for secure cookies and production security headers.
- Configure HTTPS + security headers at the edge/proxy.
