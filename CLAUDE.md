# CLAUDE.md

## Project
Script Seance — an AI-assisted screenplay drafting workspace.
React 19 · TypeScript · Vite 6 · Express 5 · Tailwind CSS · Motion (`motion/react`)
OpenAI SDK for text generation · Inworld APIs for TTS and voice catalog
Vitest + Testing Library · Playwright

See README.md for env var documentation, debug flags, and deployment notes.

## Commands
Run all commands from the repository root using `pnpm` (not `npm` or `yarn`).

- `pnpm start` — client + Express server together
- `pnpm dev` — Vite dev server (localhost:3000)
- `pnpm run server` — Express API server (localhost:3001)
- `pnpm build` — production build (Express serves dist/)
- `pnpm typecheck` — type check
- `pnpm lint` — lint
- `pnpm test` — unit/integration tests (Vitest)
- `pnpm test:playwright` — E2E tests (Playwright)
- `pnpm start:debug` — both, with `SS_DEBUG_PROMPTS=1` enabled
- `pnpm docs:refresh` — regenerate TypeDoc + dependency graph

## Architecture
Workspace state is coordinated by `hooks/useStoryWorkspace.tsx`. AI requests flow through `services/orchestration/generationOrchestrator.ts`, which enforces latest-wins behavior per `scopeKey` — each run carries a receipt (`opId`, `opType`, `scopeKey`, `startedAt`, `status`, `metadata`) and stale or superseded results are discarded.

All AI requests route through `/api/ai/generate`. Prompt construction lives in `server/llm/promptBuilders.js`; model-tier selection, token limits, and retry logic live in `server/llm/textGeneration.js`. The `generateScriptElement` action uses a `purpose` discriminator to route title suggestions to the fast model tier and insert generation to the balanced tier.

TTS playback flows through `hooks/useAudioPlayer.ts`, `services/scriptEngine.ts`, and `services/ttsCacheKeys.ts`. Auth uses password login with session cookies protecting `/api/ai/*` routes.

## Working rules
Make the smallest safe change that improves the product without destabilizing working flows. Assume wiring is usually mostly correct — for many tasks the best fix is visual, structural, or cleanup-oriented rather than architectural.

- Inspect relevant files before proposing changes.
- Prefer existing patterns over new abstractions.
- Keep diffs tight and reviewable. Do not touch unrelated code.
- Do not add dependencies unless necessary.
- Do not create wrappers, helper components, or layers unless they clearly reduce complexity.
- Keep visual consistency work separate from behavior/regression fixes unless the same ownership point requires both.
- Do not mix setup-flow styling cleanup with generation pipeline changes unless explicitly requested.

## Planning
For non-trivial work, inspect first then write a spec covering: true ownership point, direct change files, surrounding context, and smallest safe patch path. Wait for approval before implementing.

## Search
Use `rg` (not `grep`). Start with narrow searches — component name, exported symbol, prop, hook, feature flag — before expanding scope. Do not scan large portions of the repo without a clear reason.

## UI conventions
Script Seance is a dense writing workspace. Adjacent panes must feel like one product.

- Reduce padding before adding layout structure. Avoid over-containerization.
- Make controls read clearly as controls. Reveal content simply rather than burying it behind chrome.
- For UI tasks, prefer the smallest coherent local polish pass. When a fix exposes adjacent inconsistency in the same pane or control family, include that cleanup. Do not broaden into unrelated redesign.

## Cleanup
When removing stale references or old framework residue: inspect imports, branches, config, env, tests, docs, labels, and provider wiring separately. Remove only what is clearly dead. Flag uncertain items instead of guessing.

## Avoid by default
Broad component rewrites, moving state ownership without clear need, introducing new visual systems, wrapper inflation, cleanup mixed into unrelated feature work.

## Validation
After completing work, run these commands exactly as written:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`

Do not pipe, redirect, truncate, or chain these commands. Debug-only invocations (`2>&1 | head -40`, `tee`, custom `tsc --noEmit`) do not count as final validation. Do not claim completion unless all three ran and results are reported. If any are unrun or failing, say so explicitly.

DISTILLED_AESTHETICS_PROMPT = """
<frontend_aesthetics>
You tend to converge toward generic, "on distribution" outputs. In frontend design, this creates what users call the "AI slop" aesthetic. Avoid this: make creative, distinctive frontends that surprise and delight. Focus on:

Typography: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics.

Color & Theme: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Draw from IDE themes and cultural aesthetics for inspiration.

Motion: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions.

Backgrounds: Create atmosphere and depth rather than defaulting to solid colors. Layer CSS gradients, use geometric patterns, or add contextual effects that match the overall aesthetic.

Avoid generic AI-generated aesthetics:
- Overused font families (Inter, Roboto, Arial, system fonts)
- Clichéd color schemes (particularly purple gradients on white backgrounds)
- Predictable layouts and component patterns
- Cookie-cutter design that lacks context-specific character

Interpret creatively and make unexpected choices that feel genuinely designed for the context. Vary between light and dark themes, different fonts, different aesthetics. You still tend to converge on common choices (Space Grotesk, for example) across generations. Avoid this: it is critical that you think outside the box!
</frontend_aesthetics>
"""
