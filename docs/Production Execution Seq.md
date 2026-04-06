# Script Seance Production Execution Sequence

## Executive Recommendation
Treat this as an architecture-first sequence, not a polish-first sequence. Start by locking the production topology, provider-outage stance, and draft-durability promise, then use those decisions to drive auth/session replacement and deploy safety; only after that should the team harden session UX, TTS/PDF recovery, and browser-level coverage. The blunt version: decide `same-origin vs split-origin`, `real auth model`, `local-only beta vs durable drafts`, and `acceptable AI/TTS outage behavior` first; defer Playwright expansion, Safari/iOS validation, accessibility cleanup, and deeper performance work until those upstream decisions stop moving. No repo files were changed in this analysis. Current local gates pass: `pnpm typecheck`, `pnpm lint`, `pnpm test`.

## Critical Path
1. Confirm launch architecture and scope
   - Why this step comes now: the repo is naturally same-origin in production because [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js#L1459) serves `dist`, while CSP and origin controls are currently same-origin biased and strict in [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js#L103) and [vite.config.ts](/Users/seandm/Projects/Script-Seance/vite.config.ts#L5).
   - Depends on: none.
   - Unlocks: auth redesign, env validation shape, CORS/CSP decisions, legal/privacy scope, QA matrix.
   - Risk reduced: auth rework, broken cookies/origins, incorrect launch promises.

2. Replace the shared-password/session model with production identity and persistence
   - Why this step comes now: auth, session state, AI quotas, and login rate limits are all process-local in [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js#L90), and the client only understands password login/session-check in [services/auth.ts](/Users/seandm/Projects/Script-Seance/services/auth.ts#L1) and [hooks/useAuthSession.ts](/Users/seandm/Projects/Script-Seance/hooks/useAuthSession.ts#L1).
   - Depends on: topology and auth-model decision.
   - Unlocks: real session UX, accountable quotas, multi-instance deploys, meaningful auth E2E coverage.
   - Risk reduced: unauthorized access, cost leakage, broken multi-instance behavior.

3. Make deploys fail fast and observable
   - Why this step comes now: config errors currently surface at request time in [server/llm/llmClient.js](/Users/seandm/Projects/Script-Seance/server/llm/llmClient.js#L38), CI still uses `npm` and skips build in [.github/workflows/ci.yml](/Users/seandm/Projects/Script-Seance/.github/workflows/ci.yml#L1), and there is no health/readiness path in [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js).
   - Depends on: launch architecture and auth/provider criticality decisions.
   - Unlocks: safe deploys, rollback confidence, meaningful alerts, private beta operations.
   - Risk reduced: bad releases, silent outages, unknown runtime state.

4. Harden the user-visible failure paths
   - Why this step comes now: once auth/draft/provider behavior is stable, the UI can safely implement session-expiry recovery, fatal-error recovery, TTS outage handling, and PDF export fallback without churn.
   - Depends on: auth redesign, draft-durability decision, provider-outage stance.
   - Unlocks: realistic beta use, browser QA, stable E2E tests.
   - Risk reduced: white screens, draft confusion, stuck playback/export flows.

5. Define the supported performance envelope, then optimize to that envelope
   - Why this step comes now: the current build already warns on a large chunk, but long-script rendering work in [components/ScriptDisplay.tsx](/Users/seandm/Projects/Script-Seance/components/ScriptDisplay.tsx) should be driven by an explicit supported script-size target, not guesswork.
   - Depends on: stable launch scope and settled UX surfaces.
   - Unlocks: targeted bundle work, realistic perf QA, support expectations.
   - Risk reduced: wasted optimization work, under- or over-engineering.

6. Freeze flows, then expand verification
   - Why this step comes now: current Playwright coverage is narrow and auth-specific in [tests/playwright/setup-layout-smoke.spec.ts](/Users/seandm/Projects/Script-Seance/tests/playwright/setup-layout-smoke.spec.ts#L1) and [tests/playwright/ai-generate-abort.spec.ts](/Users/seandm/Projects/Script-Seance/tests/playwright/ai-generate-abort.spec.ts#L1), so adding broad browser coverage before the flows settle guarantees churn.
   - Depends on: auth/session UX, TTS/PDF recovery, perf envelope, launch-scope decisions.
   - Unlocks: final launch confidence.
   - Risk reduced: flaky tests, false confidence, expensive rework.

## Recommended Workstreams

### Workstream A — must start first
Included checklist items:
- Verify the intended production topology for frontend/API origins
- Verify whether single-provider AI/TTS is acceptable for launch SLA
- Define a production-grade draft durability strategy
- Replace the shared-password auth model and in-memory session/rate-limit state
- Add fail-fast startup validation for required production env/config
- Fix CI/release validation to match the actual project and verify the production artifact
- Add health/readiness endpoints plus baseline observability and alerting
- Add graceful shutdown behavior for server process lifecycle

Why they belong together:
- These items define the production contract: how traffic reaches the app, who the user is, what data is durable, what config is mandatory, and how operators detect and recover from failure.

Repo surfaces likely involved:
- [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js)
- [server/llm/llmClient.js](/Users/seandm/Projects/Script-Seance/server/llm/llmClient.js)
- [services/auth.ts](/Users/seandm/Projects/Script-Seance/services/auth.ts)
- [hooks/useAuthSession.ts](/Users/seandm/Projects/Script-Seance/hooks/useAuthSession.ts)
- [hooks/useDraftPersistence.ts](/Users/seandm/Projects/Script-Seance/hooks/useDraftPersistence.ts)
- [.github/workflows/ci.yml](/Users/seandm/Projects/Script-Seance/.github/workflows/ci.yml)
- [.env.example](/Users/seandm/Projects/Script-Seance/.env.example)
- [vite.config.ts](/Users/seandm/Projects/Script-Seance/vite.config.ts)

Likely collision areas if multiple people work at once:
- `server/index.js` is the main collision point.
- Auth touches both server and client session plumbing.
- Infra changes overlap on env keys, startup behavior, and deploy assumptions.

### Workstream B — can run in parallel after A starts
Included checklist items:
- Add complete session UX, not just login-gate behavior
- Add fatal-error recovery path for the client
- Improve TTS outage recovery UX
- Make PDF export less dependent on pop-up behavior
- Verify acceptable script-size limits for the target audience
- Reduce initial bundle cost and long-script rendering risk
- Remove obviously internal/dev-facing loading copy before shipping

Why they belong together:
- This is the “stabilize the user-facing product” stream. It should start once A has made the core backend decisions legible, but most of it can move in parallel across separate UI surfaces.

Repo surfaces likely involved:
- [hooks/useStoryWorkspace.tsx](/Users/seandm/Projects/Script-Seance/hooks/useStoryWorkspace.tsx)
- [App.tsx](/Users/seandm/Projects/Script-Seance/App.tsx)
- [index.tsx](/Users/seandm/Projects/Script-Seance/index.tsx)
- [hooks/useVoiceCatalog.ts](/Users/seandm/Projects/Script-Seance/hooks/useVoiceCatalog.ts)
- [services/scriptPdfExport.ts](/Users/seandm/Projects/Script-Seance/services/scriptPdfExport.ts)
- [components/ScriptDisplay.tsx](/Users/seandm/Projects/Script-Seance/components/ScriptDisplay.tsx)
- [components/workspace/sceneGenerationLoadingCopy.ts](/Users/seandm/Projects/Script-Seance/components/workspace/sceneGenerationLoadingCopy.ts)

Likely collision areas if multiple people work at once:
- `hooks/useStoryWorkspace.tsx` is the main frontend collision point.
- Export, playback, and session work all touch shared error handling.
- Perf work and fatal-error recovery both touch root/app-shell behavior.

### Workstream C — should wait until earlier decisions land
Included checklist items:
- Run an accessibility pass on auth and voice controls
- Expand end-to-end coverage for the real launch paths
- Tighten browser-level performance QA around audio and editor interactions
- Verify Safari/iOS/Firefox compatibility for audio playback and export
- Verify whether public-launch legal/privacy surfaces are required beyond the in-app modal

Why they belong together:
- These tasks validate or finalize the product after the shape of auth, durability, outage behavior, export, and supported browser scope has stopped moving.

Repo surfaces likely involved:
- [components/LoginModal.tsx](/Users/seandm/Projects/Script-Seance/components/LoginModal.tsx)
- [components/VoiceManager.tsx](/Users/seandm/Projects/Script-Seance/components/VoiceManager.tsx)
- [playwright.config.ts](/Users/seandm/Projects/Script-Seance/playwright.config.ts)
- [tests/playwright/setup-layout-smoke.spec.ts](/Users/seandm/Projects/Script-Seance/tests/playwright/setup-layout-smoke.spec.ts)
- [tests/playwright/ai-generate-abort.spec.ts](/Users/seandm/Projects/Script-Seance/tests/playwright/ai-generate-abort.spec.ts)
- [components/PrivacyModal.tsx](/Users/seandm/Projects/Script-Seance/components/PrivacyModal.tsx)

Likely collision areas if multiple people work at once:
- Playwright specs will churn if frontend flows are still changing.
- Accessibility and session UX overlap on auth controls.
- Legal/privacy surfaces may need copy changes if draft storage or processing promises change.

## Ordered Task List
1. Verify the intended production topology for frontend/API origins
   - Why here: the repo already wants same-origin prod; choosing cross-origin later would force rework across cookies, CSP, and origin handling.
   - Can parallelize with: CI/release validation discovery.
   - Must finish before: auth redesign, env validation, cross-browser auth QA.
   - Launch scope note: required for private beta.

2. Verify whether single-provider AI/TTS is acceptable for launch SLA
   - Why here: it determines whether outage handling is “retry and explain” or “build fallback/maintenance mode.”
   - Can parallelize with: topology decision, draft-durability decision.
   - Must finish before: observability alert thresholds, TTS outage UX.
   - Launch scope note: required for private beta.

3. Define a production-grade draft durability strategy
   - Why here: [hooks/useDraftPersistence.ts](/Users/seandm/Projects/Script-Seance/hooks/useDraftPersistence.ts#L1) and [components/PrivacyModal.tsx](/Users/seandm/Projects/Script-Seance/components/PrivacyModal.tsx#L60) currently promise local-only behavior, so this is both a product and technical gate.
   - Can parallelize with: topology and provider-outage decisions.
   - Must finish before: session UX, fatal-error recovery, legal/privacy scoping.
   - Launch scope note: required for private beta.

4. Replace the shared-password auth model and in-memory session/rate-limit state
   - Why here: it is the biggest technical blocker and several later tasks become stable only after identity and quota boundaries are real.
   - Can parallelize with: CI/release validation, early health/logging scaffolding.
   - Must finish before: session UX, launch-path Playwright coverage, realistic multi-user beta.
   - Launch scope note: required for private beta.

5. Fix CI/release validation to match the actual project and verify the production artifact
   - Why here: this should start early so all subsequent changes ride on the real `pnpm` + build pipeline instead of the current mismatched CI.
   - Can parallelize with: auth redesign, env validation planning.
   - Must finish before: any launch candidate or release rehearsal.
   - Launch scope note: required for private beta.

6. Add fail-fast startup validation for required production env/config
   - Why here: once auth/topology/provider criticality are known, startup should refuse bad deploys instead of waiting for first traffic.
   - Can parallelize with: CI work, health/readiness implementation.
   - Must finish before: readiness checks, beta deploys.
   - Launch scope note: required for private beta.

7. Add health/readiness endpoints plus baseline observability and alerting
   - Why here: after config validation exists, health/readiness can reflect real boot state and alerts can target the right failures.
   - Can parallelize with: graceful shutdown, frontend hardening.
   - Must finish before: any unattended beta environment.
   - Launch scope note: required for private beta.

8. Add graceful shutdown behavior for server process lifecycle
   - Why here: it belongs with the ops hardening pass and is easiest before deploy practices solidify.
   - Can parallelize with: observability, frontend hardening.
   - Must finish before: rolling deploys or auto-restarts in production.
   - Launch scope note: required for private beta.

9. Add complete session UX, not just login-gate behavior
   - Why here: after auth is real and draft behavior is defined, the client can decide what survives re-auth and how logout/expiry should behave.
   - Can parallelize with: fatal-error recovery, PDF export work.
   - Must finish before: broad Playwright coverage.
   - Launch scope note: required for public launch; deferrable for private beta only if session behavior is tightly scoped and documented.

10. Add a fatal-error recovery path for the client
   - Why here: recovery only makes sense once the draft-survival policy is decided.
   - Can parallelize with: session UX, loading-copy cleanup.
   - Must finish before: broader external beta or public launch.
   - Launch scope note: required for public launch; deferrable for small beta with explicit risk.

11. Improve TTS outage recovery UX
   - Why here: this should follow the provider-outage decision so the UI reflects the actual support policy.
   - Can parallelize with: PDF export work, session UX.
   - Must finish before: launch-path E2E coverage and browser QA.
   - Launch scope note: required for private beta if TTS is in scope.

12. Make PDF export less dependent on pop-up behavior
   - Why here: export/browser validation should target the final export path, not the current iframe-print workaround alone.
   - Can parallelize with: TTS outage UX, fatal-error recovery.
   - Must finish before: Safari/iOS/Firefox export verification.
   - Launch scope note: required for public launch; deferrable for private beta if PDF export is explicitly out of scope.

13. Verify acceptable script-size limits for the target audience
   - Why here: this sets the envelope for what “production-ready performance” actually means.
   - Can parallelize with: bundle analysis and obvious code-splitting.
   - Must finish before: deep long-script rendering optimization and perf signoff.
   - Launch scope note: required for private beta.

14. Reduce initial bundle cost and long-script rendering risk
   - Why here: split this mentally into two phases: do obvious startup bundle cuts now, but defer deeper editor virtualization until step 13 defines the supported envelope.
   - Can parallelize with: loading-copy cleanup, accessibility prep.
   - Must finish before: public launch, and before perf QA is final.
   - Launch scope note: required for public launch; partially deferrable for private beta if script-size scope is narrow.

15. Remove obviously internal/dev-facing loading copy before shipping
   - Why here: low dependency, low cost, but worth doing after product/legal tone is clearer.
   - Can parallelize with: most frontend hardening.
   - Must finish before: any external-facing beta.
   - Launch scope note: required for private beta.

16. Verify whether public-launch legal/privacy surfaces are required beyond the in-app modal
   - Why here: this should wait until draft/auth/launch-scope decisions settle, but it should happen before public-launch QA freeze.
   - Can parallelize with: accessibility, late-stage QA planning.
   - Must finish before: public launch.
   - Launch scope note: deferrable for private beta with narrow scope; required for public launch.

17. Run an accessibility pass on auth and voice controls
   - Why here: do it after auth/session and TTS UI stop moving.
   - Can parallelize with: loading-copy cleanup, early Playwright authoring.
   - Must finish before: public launch.
   - Launch scope note: required for public launch; only the most blocking issues should block a narrow private beta.

18. Expand end-to-end coverage for the real launch paths
   - Why here: Playwright should lock in final flows, not chase moving ones.
   - Can parallelize with: accessibility fixes and late perf QA prep.
   - Must finish before: launch signoff.
   - Launch scope note: required for private beta.

19. Tighten browser-level performance QA around audio and editor interactions
   - Why here: perf QA is only useful after the supported envelope and the major frontend flows are settled.
   - Can parallelize with: Safari/iOS/Firefox QA.
   - Must finish before: public launch.
   - Launch scope note: required for public launch; private beta can defer if supported device/browser scope is narrow.

20. Verify Safari/iOS/Firefox compatibility for audio playback and export
   - Why here: this is final-surface validation and depends on the auth, TTS, and export flows being close to final.
   - Can parallelize with: perf QA.
   - Must finish before: public launch, or before claiming those browsers are supported.
   - Launch scope note: deferrable for private beta only if browser support is explicitly limited.

## Decision Gates
- What decision is needed: single-origin deployment vs split frontend/API origins.
  - Which checklist items it affects: topology verification, auth redesign, env validation, session UX, Playwright coverage, cross-browser QA.
  - What work should pause until it is answered: cookie/session implementation details, CSP/CORS changes, auth-flow E2E coverage.

- What decision is needed: real auth model.
  - Which checklist items it affects: auth replacement, session UX, rate-limit persistence, observability, Playwright coverage.
  - What work should pause until it is answered: client session UX, launch-path auth tests, quota/accountability assumptions.

- What decision is needed: local-only beta drafts vs durable server-side drafts.
  - Which checklist items it affects: draft durability, fatal-error recovery, session UX, legal/privacy surfaces, export guidance.
  - What work should pause until it is answered: recovery UX, privacy copy, any claim about saved work.

- What decision is needed: acceptable provider outage behavior.
  - Which checklist items it affects: provider-SLA verification, TTS outage UX, observability/alerts, launch scope.
  - What work should pause until it is answered: outage-specific UI, alert thresholds, maintenance/fallback behavior.

- What decision is needed: supported script-size envelope.
  - Which checklist items it affects: script-size verification, bundle/rendering work, perf QA.
  - What work should pause until it is answered: deep editor virtualization or heavy rendering refactors.

- What decision is needed: private beta only vs broader public launch.
  - Which checklist items it affects: legal/privacy surfaces, Safari/iOS/Firefox support, accessibility bar, PDF export priority.
  - What work should pause until it is answered: public-facing legal finalization and full browser-support signoff.

## Suggested Team Split
- Frontend: own session UX, fatal-error recovery, TTS outage UX, PDF export flow, loading-copy cleanup, and later accessibility. Avoid parallel edits to [hooks/useStoryWorkspace.tsx](/Users/seandm/Projects/Script-Seance/hooks/useStoryWorkspace.tsx) by assigning one owner there.
- Backend: own auth/session/rate-limit redesign plus startup env validation. Expect heavy work in [server/index.js](/Users/seandm/Projects/Script-Seance/server/index.js), so keep this with one primary owner.
- Infra: own CI/build parity, topology confirmation, health/readiness, observability, graceful shutdown, and deployment/rollback assumptions.
- QA/product: own draft-durability decision, provider-outage policy, script-size target, legal/privacy scope, and late-stage Playwright/manual browser plans. Start writing test plans early, but wait to automate final flows until auth and failure UX settle.

## Fastest Safe Path to Launch
1. Private beta
   - Lock same-origin production topology.
   - Decide provider outage stance.
   - Decide and explicitly scope draft durability; the fastest safe beta is local-only drafts with explicit UX warnings, not pretending drafts are durable cloud data.
   - Replace shared-password/in-memory auth with a real identity/session approach.
   - Fix CI to use `pnpm` and require build.
   - Add startup env validation, health/readiness, observability, and graceful shutdown.
   - Harden the minimum user-facing failure paths that match beta scope: session UX if sessions can expire during use, TTS outage UX if TTS is in scope, and remove internal loading copy.
   - Expand Playwright for the actual beta happy path plus core failures.
   - Defer for beta if scope is narrowed: public legal/privacy pages, full Safari/iOS/Firefox support, deep long-script optimization, full accessibility sweep, PDF export hardening if PDF is not part of beta.

2. Public launch
   - Complete everything above.
   - Resolve public-launch legal/privacy requirements beyond the in-app modal.
   - Finish session UX, fatal-error recovery, PDF export hardening, accessibility, supported-script-size validation, and the resulting perf work.
   - Run final Playwright, browser-level perf QA, and Safari/iOS/Firefox validation against the final flows.
   - Do not claim public production readiness until browser support, legal surfaces, and supported-performance envelope are explicit.

## Anti-Patterns to Avoid
- Expanding Playwright too early while auth is still a shared password and the client only knows the current login/session-check flow.
- Building session-expiry/logout UX before the auth model and draft-survival policy are decided.
- Writing legal/privacy copy before deciding whether drafts remain local-only or become server-durable.
- Doing deep `ScriptDisplay` performance work before setting supported script-size limits.
- Treating topology as a late infra detail when it changes cookies, CSP, origin policy, and test shape.
- Shipping observability after beta starts; if auth, AI, or TTS fail in production, you need probes and alerts before users discover it first.
