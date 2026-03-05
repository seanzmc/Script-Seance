# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**Script Seance** — React 19 + TypeScript frontend, Express 5 API backend. AI-assisted screenplay drafting with OpenAI/Gemini text generation and Inworld TTS voice playback.

## Commands

```bash
# Development
pnpm start            # client (port 3000) + server (port 3001) concurrently
pnpm dev              # Vite client only
pnpm server           # Node server only
pnpm start:debug      # debug mode (verbose prompt/abort logging)

# Quality gates (all three must pass before claiming a task complete)
pnpm typecheck
pnpm lint
pnpm test

# Run a single test file
pnpm test -- tests/generationOrchestrator.test.ts

# Run tests matching a pattern
pnpm test -- --grep "orchestrator"

# Build
pnpm build
```

**Use `pnpm` exclusively.** Run all commands from the repo root.

## Mandatory Gates

A task is not complete until all three pass in the same working-tree state:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

If behavior or build tooling changed, also run `pnpm build`.

## Spec-First Workflow

For non-trivial tasks (touches > 1 file, changes behavior, adds/changes tests or config): produce a spec first with no edits, then wait for approval before implementing.

## Architecture

### Frontend (`App.tsx` → components, services, hooks)

- **`App.tsx`** — root state, wires `GenerationOrchestrator`, `ScriptMutationController`, `useAudioPlayer` together.
- **`services/orchestration/generationOrchestrator.ts`** — latest-wins deduplication. One active op per `scopeKey`; a new run aborts the prior in that scope. Each run carries a `Receipt` (`opId`, `opType`, `scopeKey`, `startedAt`, `status`, `metadata`). Commits only if the run is still active **and** `isFresh(receipt)` passes; stale/superseded outcomes are dropped silently.
- **`services/scriptController.ts`** — script mutation controller with full undo/redo. Manages `ScriptBlock` mutations, composer UI state (`openInsert`, `openRewrite`), and `ScriptAnchor` positioning.
- **`services/scriptEngine.ts`** — audio playback engine. LRU-cached TTS audio, block queue, Web Audio API playback. Cache keys built in `services/ttsCacheKeys.ts`.
- **`services/ai.ts`** — client API layer for LLM + TTS requests (typed `ApiResponse<T>`, abort signal propagation).
- **`hooks/useAudioPlayer.ts`** — integrates `ScriptEngine` with React state for playback controls.
- **`domain/blocks.ts`** — block creation, normalization, validation rules.

### Backend (`server/`)

- **`server/index.js`** — Express setup, session/auth middleware, rate limiting (RPM + RPD), origin guard, route definitions for `/api/ai/*` and `/api/tts/*`.
- **`server/llm/textGeneration.js`** — per-kind LLM routing, model selection (OpenAI primary / Gemini fallback), streaming, retries with exponential backoff.
- **`server/llm/promptBuilders.js`** — prompt template builders (`buildScenePrompt`, `buildRewritePrompt`, etc.).
- **`server/ttsProviders.js`** — Inworld TTS integration.
- **`server/upstreamControl.js`** — retry + abort logic for upstream calls.

### Request Flow

1. Client calls `services/ai.ts` → `POST /api/ai/generate` with `kind` + context.
2. Server: auth check → rate limit → `promptBuilders` → `textGeneration` → OpenAI/Gemini → JSON response.
3. Orchestrator `isFresh` check → commit or drop.
4. TTS: `POST /api/tts/generate` per block → Inworld API → base64 PCM → cached in `ScriptEngine`.

### Type System

Core types in `types.ts`: `ScriptBlock`, `Scene`, `StoryContext`, `VoiceConfig`, `ScriptAnchor`.
Operation/outcome types in `services/orchestration/types.ts`: `Outcome<T>`, `Receipt`, `ActiveOp`.

## Code Quality Rules

- Keep TypeScript strict; avoid `any` without clear need.
- Avoid `// @ts-ignore`; document inline if truly unavoidable.
- Reuse existing patterns before introducing abstractions.
- Keep public contracts stable unless the task explicitly requires breaking changes.
- Prefer minimal, targeted changes — do not modify unrelated files.

## Local Setup

```bash
cp .env.example .env
# Minimum required:
#   OPENAI_API_KEY=...
#   ADMIN_PASSWORD=...
pnpm install
pnpm start
```

Optional: `GEMINI_API_KEY` for Gemini fallback; `INWORLD_API_KEY` + `INWORLD_API_SECRET` + `INWORLD_WORKSPACE_ID` for TTS.

## Debugging

Set in browser console:

```js
window.__SS_DEBUG_PROMPTS__ = true;     // Prompt Inspector UI + verbose prompt traces
window.__SS_DEBUG_AI_ABORTS__ = true;   // Orchestrator abort/cancel logs
```

Server-side prompt trace also requires `SS_DEBUG_PROMPTS=1` env var (non-production only).

## Docs

```bash
pnpm docs:typedoc    # build TypeDoc HTML into docs/typedoc
pnpm docs:refresh    # regenerate typedoc + mermaid dependency graph
pnpm hooks:install   # configure git pre-commit hook (auto-runs docs:typedoc + docs:graph:mermaid)
```
