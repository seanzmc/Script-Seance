# Script Seance Production Readiness Checklist

## Executive Summary
Script Seance is functional and has stronger-than-average guardrails in several risky areas already: server-side AI validation, origin checks, security headers, retries/timeouts, TTS queueing, and a solid unit/integration test base. It is still **not ready** for a real production launch because auth/session design, draft durability, operational readiness, release pipeline reliability, and a few ship-visible polish issues are not yet at production standard. Current gates passed locally on April 4, 2026: `pnpm typecheck`, `pnpm lint`, `pnpm test`; `pnpm build` also succeeded, but the production bundle emitted a large-chunk warning (`dist/assets/index-Crq9-lKJ.js` at 951.90 kB minified, 262.13 kB gzip).

## Launch Blockers
- [ ] Replace the shared-password auth model and in-memory session/rate-limit state
  Why it matters: A single `ADMIN_PASSWORD` plus process-local maps is not a safe or operable production auth model for real users, multi-instance deploys, or accountable cost control.
  Evidence: [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js#L64), [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js#L90), [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js#L785), [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js#L931), [services/auth.ts](/Users/seandm/Projects/Script-Seance/services/auth.ts#L43)
  Recommended action: Move to real user authentication or a deployment-managed auth layer, persist sessions and rate limits outside process memory, and tie quotas/auditing to user identity rather than a shared password.
  Owner area: backend
  Confidence: high

- [ ] Add fail-fast startup validation for required production env/config
  Why it matters: Missing core config currently fails at request time, which creates avoidable 500s after deploy instead of blocking a bad release.
  Evidence: [server/llm/llmClient.js](/Users/seandm/Projects/Script-Seance/server/llm/llmClient.js#L43), [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js#L931), [hooks/useStoryWorkspace.tsx](/Users/seandm/Projects/Script-Seance/hooks/useStoryWorkspace.tsx#L1288)
  Recommended action: Validate required env vars at boot for auth, OpenAI, and any launch-critical TTS features; fail startup loudly; add an environment checklist to deployment.
  Owner area: backend
  Confidence: high

- [ ] Define a production-grade draft durability strategy
  Why it matters: Drafts currently live only in browser storage and save on a debounce timer, so tab close/crash/device loss can still drop user work.
  Evidence: [hooks/useDraftPersistence.ts](/Users/seandm/Projects/Script-Seance/hooks/useDraftPersistence.ts#L43), [hooks/useDraftPersistence.ts](/Users/seandm/Projects/Script-Seance/hooks/useDraftPersistence.ts#L61), [components/PrivacyModal.tsx](/Users/seandm/Projects/Script-Seance/components/PrivacyModal.tsx#L70)
  Recommended action: Either add durable server-side draft persistence, or explicitly launch as a scoped local-only beta and at minimum add unload-safe saving/export guidance so users cannot mistake this for durable cloud storage.
  Owner area: product
  Confidence: high

- [ ] Add health/readiness endpoints plus baseline observability and alerting
  Why it matters: There is no repo-visible health probe, metrics, tracing, or alert path for AI/TTS failures, auth failures, or degraded upstreams.
  Evidence: [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js#L1031), [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js#L1042), [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js#L1461), [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js#L1480)
  Recommended action: Add `/healthz` and `/readyz`, structured request/error logs, request IDs, and alerts for elevated 5xx/429/timeout/provider-failure rates before launch.
  Owner area: infra
  Confidence: high

- [ ] Fix CI/release validation to match the actual project and verify the production artifact
  Why it matters: The repo standard is `pnpm`, but CI uses `npm`; CI also skips `pnpm build`, so the shipped artifact is not currently a required gate.
  Evidence: [package.json](/Users/seandm/Projects/Script-Seance/package.json#L6), [package.json](/Users/seandm/Projects/Script-Seance/package.json#L14), [.github/workflows/ci.yml](/Users/seandm/Projects/Script-Seance/.github/workflows/ci.yml#L16), [.github/workflows/ci.yml](/Users/seandm/Projects/Script-Seance/.github/workflows/ci.yml#L18)
  Recommended action: Switch CI to `pnpm`, add `pnpm build`, and define a deployment/rollback path that uses the same lockfile and commands as local development.
  Owner area: infra
  Confidence: high

- [ ] Remove obviously internal/dev-facing loading copy before shipping
  Why it matters: Several user-visible loading lines read like internal jokes or unfinished-product copy and would make the app feel unlaunched.
  Evidence: [components/workspace/sceneGenerationLoadingCopy.ts](/Users/seandm/Projects/Script-Seance/components/workspace/sceneGenerationLoadingCopy.ts#L14), [components/workspace/sceneGenerationLoadingCopy.ts](/Users/seandm/Projects/Script-Seance/components/workspace/sceneGenerationLoadingCopy.ts#L20), [components/workspace/sceneGenerationLoadingCopy.ts](/Users/seandm/Projects/Script-Seance/components/workspace/sceneGenerationLoadingCopy.ts#L23)
  Recommended action: Replace launch-time loading copy with product-reviewed messaging that preserves tone without signaling “still in development” or exposing internal AI jokes.
  Owner area: product
  Confidence: high

## High Priority But Not Blocking
- [ ] Reduce initial bundle cost and long-script rendering risk
  Why it matters: The current production build is large, and the main script surface renders full scene/block trees with DOM queries and no code-splitting or virtualization.
  Evidence: `pnpm build` emitted a 951.90 kB JS chunk warning; [index.tsx](/Users/seandm/Projects/Script-Seance/index.tsx#L29), [components/ScriptDisplay.tsx](/Users/seandm/Projects/Script-Seance/components/ScriptDisplay.tsx#L313), [components/ScriptDisplay.tsx](/Users/seandm/Projects/Script-Seance/components/ScriptDisplay.tsx#L735), [components/ScriptDisplay.tsx](/Users/seandm/Projects/Script-Seance/components/ScriptDisplay.tsx#L771)
  Recommended action: Add route/component code-splitting for non-critical surfaces and benchmark/editor-test large drafts; if long scripts are a real target, plan virtualization or memoized row extraction.
  Owner area: frontend
  Confidence: high

- [ ] Add a fatal-error recovery path for the client
  Why it matters: The root mounts straight into `<App />`; an uncaught render/runtime error can still white-screen the editor with no recovery UI.
  Evidence: [index.tsx](/Users/seandm/Projects/Script-Seance/index.tsx#L29), [App.tsx](/Users/seandm/Projects/Script-Seance/App.tsx#L18)
  Recommended action: Add an error boundary around the workspace shell with a recovery path that preserves or exports the local draft when possible.
  Owner area: frontend
  Confidence: medium

- [ ] Expand end-to-end coverage for the real launch paths
  Why it matters: The repo has strong unit/integration coverage, but browser-level coverage is still narrow relative to the product surface.
  Evidence: [playwright.config.ts](/Users/seandm/Projects/Script-Seance/playwright.config.ts#L4), [tests/playwright/ai-generate-abort.spec.ts](/Users/seandm/Projects/Script-Seance/tests/playwright/ai-generate-abort.spec.ts#L30), [tests/playwright/setup-layout-smoke.spec.ts](/Users/seandm/Projects/Script-Seance/tests/playwright/setup-layout-smoke.spec.ts#L47)
  Recommended action: Add Playwright coverage for login, first-scene generation, rewrite/insert flows, voice casting, playback retry/skip, and export.
  Owner area: QA
  Confidence: high

- [ ] Improve TTS outage recovery UX
  Why it matters: Voice catalog load currently happens once, and the UI mostly falls back to passive text when the provider is unavailable or unconfigured.
  Evidence: [hooks/useVoiceCatalog.ts](/Users/seandm/Projects/Script-Seance/hooks/useVoiceCatalog.ts#L12), [hooks/useVoiceCatalog.ts](/Users/seandm/Projects/Script-Seance/hooks/useVoiceCatalog.ts#L19), [hooks/useStoryWorkspace.tsx](/Users/seandm/Projects/Script-Seance/hooks/useStoryWorkspace.tsx#L1282)
  Recommended action: Add explicit retry/reload affordances, distinguish misconfiguration from transient outage, and surface clearer recovery options in the playback and casting UI.
  Owner area: frontend
  Confidence: high

- [ ] Add complete session UX, not just login-gate behavior
  Why it matters: The server exposes logout, but the client only implements login/session-check flows; session expiry currently collapses back to the login modal mid-work.
  Evidence: [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js#L1033), [services/auth.ts](/Users/seandm/Projects/Script-Seance/services/auth.ts#L43), [hooks/useAuthSession.ts](/Users/seandm/Projects/Script-Seance/hooks/useAuthSession.ts#L16)
  Recommended action: After the auth redesign, add logout, clearer expired-session recovery, and product decisions around whether draft state should survive re-auth seamlessly.
  Owner area: frontend
  Confidence: high

## Medium Priority
- [ ] Run an accessibility pass on auth and voice controls
  Why it matters: Some controls rely on visual text without clear programmatic association, especially in auth and advanced voice settings.
  Evidence: [components/LoginModal.tsx](/Users/seandm/Projects/Script-Seance/components/LoginModal.tsx#L75), [components/VoiceManager.tsx](/Users/seandm/Projects/Script-Seance/components/VoiceManager.tsx#L111), [components/VoiceManager.tsx](/Users/seandm/Projects/Script-Seance/components/VoiceManager.tsx#L181), [components/VoiceManager.tsx](/Users/seandm/Projects/Script-Seance/components/VoiceManager.tsx#L196)
  Recommended action: Add proper `htmlFor`/`id` or `aria-labelledby` wiring, then do a keyboard and screen-reader pass across setup, auth, script editing, and audio controls.
  Owner area: frontend
  Confidence: medium

- [ ] Make PDF export less dependent on pop-up behavior
  Why it matters: PDF export currently depends on opening a new window and falls back to blocking alerts when the browser refuses it.
  Evidence: [hooks/useStoryWorkspace.tsx](/Users/seandm/Projects/Script-Seance/hooks/useStoryWorkspace.tsx#L1195), [hooks/useStoryWorkspace.tsx](/Users/seandm/Projects/Script-Seance/hooks/useStoryWorkspace.tsx#L1202)
  Recommended action: Replace or supplement the pop-up path with a more reliable export workflow, or at minimum harden the UX around blocked pop-ups.
  Owner area: frontend
  Confidence: high

- [ ] Add graceful shutdown behavior for server process lifecycle
  Why it matters: The server boots and runs cleanup timers, but there is no repo-visible shutdown handling for draining in-flight work or closing cleanly.
  Evidence: [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js#L920), [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js#L1484)
  Recommended action: Handle termination signals, stop accepting new traffic, and document expected behavior for restarts/rolling deploys.
  Owner area: infra
  Confidence: medium

- [ ] Tighten browser-level performance QA around audio and editor interactions
  Why it matters: Audio handling is thoughtful, but the app still depends on `AudioContext`, DOM scrolling, and state-heavy editor surfaces that can behave differently on weaker devices.
  Evidence: [hooks/useAudioPlayer.ts](/Users/seandm/Projects/Script-Seance/hooks/useAudioPlayer.ts#L176), [hooks/useAudioPlayer.ts](/Users/seandm/Projects/Script-Seance/hooks/useAudioPlayer.ts#L300), [components/ScriptDisplay.tsx](/Users/seandm/Projects/Script-Seance/components/ScriptDisplay.tsx#L396)
  Recommended action: Add performance budgets and browser QA for playback start latency, scroll behavior, and long-session memory growth.
  Owner area: QA
  Confidence: medium

## Needs Verification
- [ ] Verify the intended production topology for frontend/API origins
  Why it matters: Current protections assume same-origin production traffic is likely, but cross-origin deployment would need explicit CORS and CSP decisions.
  Evidence: [vite.config.ts](/Users/seandm/Projects/Script-Seance/vite.config.ts#L5), [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js#L103), [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js#L982)
  How to verify: Confirm whether production serves client and API from one origin; if not, test browser requests from the real frontend origin and validate `Access-Control-*` headers and CSP `connect-src`.
  Owner area: infra
  Confidence: medium

- [ ] Verify Safari/iOS/Firefox compatibility for audio playback and export
  Why it matters: The code includes a WebKit audio fallback, but the repo does not show real cross-browser end-to-end validation for TTS playback/export flows.
  Evidence: [hooks/useAudioPlayer.ts](/Users/seandm/Projects/Script-Seance/hooks/useAudioPlayer.ts#L179), [hooks/useStoryWorkspace.tsx](/Users/seandm/Projects/Script-Seance/hooks/useStoryWorkspace.tsx#L1191), [playwright.config.ts](/Users/seandm/Projects/Script-Seance/playwright.config.ts#L10)
  How to verify: Manually test voice preview, full playback, retry/skip, TXT export, and PDF export on Safari desktop, iPhone Safari, and Firefox.
  Owner area: QA
  Confidence: medium

- [ ] Verify whether single-provider AI/TTS is acceptable for launch SLA
  Why it matters: Text generation is OpenAI-only and speech is Inworld-only; the code has retries and model promotion, but not provider failover.
  Evidence: [server/llm/llmClient.js](/Users/seandm/Projects/Script-Seance/server/llm/llmClient.js#L43), [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js#L71), [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js#L725)
  How to verify: Define acceptable outage behavior for launch, then test degraded-provider scenarios against that bar; if uptime requirements are stricter, add a fallback or maintenance mode.
  Owner area: product
  Confidence: medium

- [ ] Verify whether public-launch legal/privacy surfaces are required beyond the in-app modal
  Why it matters: The app discloses local drafts and third-party AI processing in-app, but the repo does not show full public legal surfaces.
  Evidence: [components/PrivacyModal.tsx](/Users/seandm/Projects/Script-Seance/components/PrivacyModal.tsx#L42), [components/PrivacyModal.tsx](/Users/seandm/Projects/Script-Seance/components/PrivacyModal.tsx#L60)
  How to verify: Confirm launch scope and jurisdiction; if this is a real public release, decide whether standalone privacy/terms/help pages are required.
  Owner area: product
  Confidence: low

- [ ] Verify acceptable script-size limits for the target audience
  Why it matters: The editor is clearly built for screenplay drafting, but the repo does not define the largest draft size that must remain smooth in production.
  Evidence: [components/ScriptDisplay.tsx](/Users/seandm/Projects/Script-Seance/components/ScriptDisplay.tsx#L735), [components/ScriptDisplay.tsx](/Users/seandm/Projects/Script-Seance/components/ScriptDisplay.tsx#L771)
  How to verify: Create representative long drafts, profile editor scroll/edit/playback on low-end laptops and phones, and set a supported max-script envelope.
  Owner area: QA
  Confidence: medium

## Already Appears Covered
- AI request and response validation are stronger than typical: hand-validated request payloads, prompt-size caps, and response-shape checks exist in [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js#L162), [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js#L1052), and [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js#L1461).
- Origin allowlisting and production security headers appear in place already via [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js#L103), [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js#L982), and are backed by [tests/serverOriginGuard.test.ts](/Users/seandm/Projects/Script-Seance/tests/serverOriginGuard.test.ts).
- Prompt/debug leakage risk looks intentionally constrained: debug flags are dev-only in [index.tsx](/Users/seandm/Projects/Script-Seance/index.tsx#L14), server prompt tracing is disabled in prod in [server/llm/promptTrace.js](/Users/seandm/Projects/Script-Seance/server/llm/promptTrace.js#L85), and the panel only renders conditionally in [App.tsx](/Users/seandm/Projects/Script-Seance/App.tsx#L78).
- TTS queueing, cancellation, and cache bounds appear thoughtfully handled in [services/ai.ts](/Users/seandm/Projects/Script-Seance/services/ai.ts#L309), [services/ai.ts](/Users/seandm/Projects/Script-Seance/services/ai.ts#L820), [services/audioCache.ts](/Users/seandm/Projects/Script-Seance/services/audioCache.ts#L1), and [hooks/useAudioPlayer.ts](/Users/seandm/Projects/Script-Seance/hooks/useAudioPlayer.ts#L300).
- Automated coverage is broad for current logic: `pnpm test` passed 233 tests across 28 files, including server reliability/origin tests, orchestration, playback, setup, hydration, and UI interaction suites; Playwright also covers setup layout and AI request stability in [tests/playwright/setup-layout-smoke.spec.ts](/Users/seandm/Projects/Script-Seance/tests/playwright/setup-layout-smoke.spec.ts) and [tests/playwright/ai-generate-abort.spec.ts](/Users/seandm/Projects/Script-Seance/tests/playwright/ai-generate-abort.spec.ts).

## Suggested Launch Sequence
1. Safety and security
- Replace shared-password auth and move session/rate-limit state out of process memory.
- Add fail-fast env validation.
- Confirm production origin/CSP topology.
- Remove internal/dev loading copy.

2. Data integrity and backend reliability
- Decide the real draft durability model.
- Add health/readiness endpoints and structured observability.
- Harden TTS outage recovery UX.
- Define acceptable provider-outage behavior.

3. Core UX and product polish
- Add logout/session UX.
- Add fatal-error recovery UI.
- Fix PDF export reliability.
- Complete accessibility cleanup.

4. Test coverage and release verification
- Expand Playwright to full happy-path and failure-path coverage.
- Run cross-browser audio/export/manual QA.
- Benchmark large drafts and set supported limits.

5. Deployment and monitoring
- Fix CI to use `pnpm` and require `pnpm build`.
- Define deployment, rollback, and restart behavior.
- Add alerts for AI/TTS/auth failure rates and upstream latency spikes.

## Critical Manual QA Scenarios
- [ ] Fresh login, failed login, rate-limited login, session expiry during active editing.
- [ ] Start a new script, use manual setup, generate the first scene, then generate a second scene.
- [ ] Use “Let AI Surprise Me,” then switch to manual premise entry after a failure.
- [ ] Rewrite a block, apply the rewrite, undo, redo, and confirm the correct block remains selected/highlighted.
- [ ] Insert new content before/after blocks and at scene boundaries, then export TXT and PDF.
- [ ] Assign voices, preview voices, start full playback, pause/resume, skip, retry a failed block, and change a voice mid-session.
- [ ] TTS provider unavailable or voice catalog unavailable: confirm recovery messaging and no broken controls.
- [ ] Close/reload the tab after edits, including immediately after typing, to confirm draft persistence behavior matches the product promise.
- [ ] Mobile-width setup flow, script editing, drawers, and playback controls on at least one real phone.
- [ ] Safari desktop/iPhone Safari PDF export and audio playback behavior.
