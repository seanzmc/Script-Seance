Yep. The sequence doc is solid. The next move is to turn it into tight, non-wandering Codex specs that each attack one bounded slice of work.

I’d break the execution path into focused specs like this, in order:

Spec 1: Lock production topology and deployment assumptions

Recommended Codex reasoning level: high

You are working in the Script Seance repository.

Task:
Audit the current production topology assumptions and produce a concrete recommendation for the deployment shape the app should use for launch.

Goal:
Determine whether Script Seance should launch as:
1. same-origin frontend + API, or
2. split-origin frontend + API

Then document the exact technical implications of that choice for this repo.

Important constraints:
- Do not implement topology changes yet.
- Do not modify runtime code unless absolutely necessary to validate an assumption.
- This is an architecture decision + repo audit, not a refactor task.

What to inspect:
- server/index.js
- vite.config.ts
- any current cookie/session logic
- any CSP/CORS/security-header logic
- env handling
- current production serving assumptions
- any preview/build/deploy config
- CI workflow
- PDF/export/audio flows only insofar as origin behavior affects them

Questions to answer:
1. What topology does the current repo already naturally want?
2. What would break or need rework if we chose split-origin later?
3. What are the auth/session implications of each option?
4. What are the CSP/CORS implications of each option?
5. What choice best minimizes launch risk and rework?

Required output format:
Return:

## Current State
- What the repo currently assumes
- Exact files involved
- Constraints already baked into the code

## Options
### Same-origin
- Pros for this repo
- Cons for this repo
- Files/surfaces affected

### Split-origin
- Pros for this repo
- Cons for this repo
- Files/surfaces affected

## Recommendation
- One blunt recommendation
- Why
- What future work it unlocks
- What future work it avoids

## Follow-on Implementation Tasks
- A short bullet list of the exact implementation tasks that should come next once this decision is accepted

Quality bar:
- Be repo-specific
- Be opinionated
- Reduce future auth/origin rework
- Do not implement anything

Spec 2: Design the production auth/session replacement

Recommended Codex reasoning level: high

You are working in the Script Seance repository.

Task:
Design the replacement for the current shared-password + in-memory session model so the app can support a real production launch.

Goal:
Produce a concrete implementation plan for production-grade auth/session handling in this repo.

Important constraints:
- Do not implement auth yet.
- Do not rewrite large parts of the app.
- Base the design on the actual current client/server auth flow.
- Prefer the smallest production-safe auth model that fits the launch scope.

What to inspect:
- server/index.js
- services/auth.ts
- hooks/useAuthSession.ts
- any login/session-check/logout endpoints or helpers
- rate-limit/quota/session storage logic
- any env/config related to auth
- current UI login flow
- any launch assumptions from docs/productionChecklist.md and docs/Production Execution Seq.md

Questions to answer:
1. What exactly is the current auth/session model?
2. Why is it unsafe or insufficient for production?
3. What replacement model best fits this repo?
4. What should be persisted server-side vs client-side?
5. How should session expiration, logout, quota/accountability, and multi-instance behavior work?
6. What is the smallest viable production-safe auth path for:
   - private beta
   - public launch

Required output format:
Return:

## Current Auth State
- Current model
- Files involved
- Main production risks

## Recommended Auth Model
- Exact recommended approach
- Why it fits this repo
- What storage/session mechanism it should use
- How it should behave across refresh/restart/multi-instance deploys

## Required Backend Changes
- Concrete list

## Required Frontend Changes
- Concrete list

## Migration Sequence
- Ordered implementation steps
- What can be parallelized
- What should wait

## Beta vs Public Launch Scope
- What is enough for private beta
- What must be added for public launch

Quality bar:
- Keep it realistic
- Avoid gold-plating
- Make the next implementation spec easy to write
- Do not implement anything

Spec 3: Implement CI/build parity and fail-fast env validation

Recommended Codex reasoning level: high

You are working in the Script Seance repository.

Task:
Bring CI/release validation in line with the actual project and add fail-fast startup validation for required production configuration.

Goal:
Make bad deploys fail early and make CI reflect the real build/test path.

Scope:
This spec should implement only:
1. CI/build parity fixes
2. startup env/config validation
3. any narrowly related tests/docs updates required by those changes

Do not:
- redesign auth
- add observability platforms
- change unrelated runtime behavior

What to inspect first:
- .github/workflows/ci.yml
- package.json
- pnpm-lock.yaml
- server/index.js
- server/llm/llmClient.js
- .env.example
- any config bootstrap helpers

Implementation requirements:
1. CI must use the actual project package manager and required gates
2. CI must verify the production artifact, not just partial checks
3. Startup should fail fast when required production env/config is missing or invalid
4. Config failures should happen at boot, not on first user request
5. Error messages should clearly identify what is missing/misconfigured
6. Scope should remain tight and production-minded

Expected output format:
Return:

## Plan
- Short summary of the implementation approach

## Changes Made
- Bullet list of exact files changed
- Concise explanation of each change

## Validation
- Tests added/updated
- Manual verification performed
- Results of:
  - pnpm typecheck
  - pnpm lint
  - pnpm test
  - pnpm build

Quality bar:
- CI matches reality
- production config errors fail early
- no unrelated refactors

Spec 4: Add health/readiness + graceful shutdown

Recommended Codex reasoning level: high

You are working in the Script Seance repository.

Task:
Add baseline operational hardening for launch by implementing health/readiness endpoints and graceful shutdown behavior.

Goal:
Make the server report whether it is alive and ready, and shut down cleanly during deploy/restart events.

Scope:
Implement only:
1. health endpoint
2. readiness endpoint
3. graceful shutdown handling
4. narrowly related tests if feasible

Do not:
- add a full external observability platform
- redesign server architecture
- make unrelated route changes

What to inspect first:
- server/index.js
- current server startup/bootstrap flow
- any app.listen handling
- any long-lived resources, timers, in-memory state, or outstanding request concerns
- docs/Production Execution Seq.md for intended purpose

Implementation requirements:
1. Health endpoint should answer “process is up”
2. Readiness endpoint should answer “app is ready to serve traffic”
3. Readiness should reflect startup/config state meaningfully
4. Graceful shutdown should handle SIGTERM/SIGINT and stop accepting new work cleanly
5. Shutdown behavior should avoid abrupt in-flight disruption where practical
6. Implementation should be minimal and production-minded

Expected output format:
Return:

## Plan
- Short summary

## Changes Made
- Bullet list of exact files changed
- Concise explanation of each change

## Validation
- Tests added/updated
- Manual verification performed
- Results of:
  - pnpm typecheck
  - pnpm lint
  - pnpm test
  - pnpm build

Quality bar:
- endpoints are simple and trustworthy
- shutdown behavior is real, not decorative
- no unrelated refactors

Spec 5: Define draft durability strategy

Recommended Codex reasoning level: high

You are working in the Script Seance repository.

Task:
Audit the current draft persistence model and produce a concrete recommendation for launch durability behavior.

Goal:
Answer whether Script Seance should launch with:
1. local-only draft persistence for private beta, or
2. durable server-backed drafts

Then define exactly what the app should promise users.

Important constraints:
- Do not implement storage changes yet.
- This is a product/technical contract spec, not a refactor.
- Base the answer on the real current draft persistence behavior.

What to inspect:
- hooks/useDraftPersistence.ts
- any localStorage/indexedDB usage
- any draft save/load/export flows
- components/PrivacyModal.tsx
- auth/session assumptions
- docs/productionChecklist.md
- docs/Production Execution Seq.md

Questions to answer:
1. What does the app currently do?
2. What does the UI currently imply or promise?
3. What are the risks of local-only persistence?
4. What is the fastest safe private beta scope?
5. What would need to change for public-launch durable drafts?

Required output format:
Return:

## Current Draft Behavior
- What is stored
- Where
- What users are likely to believe
- What is risky/misleading today

## Recommendation for Private Beta
- Exact durability stance
- Exact user promise
- Required UI/copy clarifications

## Recommendation for Public Launch
- Exact durability stance
- Required backend/auth implications

## Follow-on Implementation Tasks
- Ordered list of what should be built next depending on the chosen durability scope

Quality bar:
- Be concrete
- Protect users from false expectations
- Make later session/error-recovery work easier
- Do not implement anything

Spec 6: Implement session UX hardening

Recommended Codex reasoning level: high

You are working in the Script Seance repository.

Task:
Harden the client-side session UX so authentication failures, expiry, and re-entry behave intentionally instead of as a thin login gate.

Goal:
Make session behavior understandable and recoverable for real users.

Important constraints:
- Assume the auth model has already been chosen or implemented.
- Do not redesign the overall app shell.
- Keep scope to session UX and directly related recovery behavior.

What to inspect:
- hooks/useAuthSession.ts
- services/auth.ts
- App.tsx
- login/session UI surfaces
- any current expiry/error handling in hooks/useStoryWorkspace.tsx
- any draft persistence interactions relevant to re-auth

Implementation requirements:
1. Expired/invalid sessions should surface clearly
2. Re-auth should behave predictably
3. Logout should cleanly reset what must reset
4. UX should align with the chosen draft-durability promise
5. No white-screen or confusing dead-state behavior
6. No unrelated UI redesign

Expected output format:
Return:

## Plan
- Short summary

## Changes Made
- Bullet list of exact files changed
- Concise explanation of each change

## Validation
- Tests added/updated
- Manual verification performed
- Results of:
  - pnpm typecheck
  - pnpm lint
  - pnpm test
  - pnpm build

Spec 7: Implement fatal-error recovery path

Recommended Codex reasoning level: high

You are working in the Script Seance repository.

Task:
Add a real fatal-error recovery path for the client so unexpected failures do not leave the user stranded in a broken workspace.

Goal:
When a fatal client/runtime error occurs, the app should present a controlled recovery surface instead of collapsing into an unusable state.

Scope:
- fatal client error handling
- recovery UI/path
- alignment with current draft persistence strategy
- focused regression coverage

Do not:
- redesign the workspace
- implement unrelated performance work
- broaden into general polish

What to inspect:
- App.tsx
- index.tsx
- hooks/useStoryWorkspace.tsx
- any existing error banners or boundary patterns
- draft persistence behavior
- auth/session behavior

Implementation requirements:
1. Fatal errors must land in a controlled recovery surface
2. Recovery options must match actual durability guarantees
3. The user should not be misled about whether work can be recovered
4. The app should not stay stuck in a broken half-mounted state
5. Scope should remain tight

Expected output format:
Return:

## Plan
## Changes Made
## Validation

Spec 8: Implement TTS outage recovery UX

Recommended Codex reasoning level: medium-high

You are working in the Script Seance repository.

Task:
Improve the TTS outage/failure UX so playback failures feel intentional, understandable, and recoverable.

Goal:
If TTS is unavailable, misconfigured, rate-limited, or temporarily failing, the user should get a clear product-grade response rather than a vague or broken one.

Scope:
- client-side TTS failure UX
- mapping server/provider failures into useful user-visible states
- preserving normal playback flow when TTS works

Do not:
- redesign the voice system
- switch providers
- broaden into unrelated audio refactors

What to inspect:
- hooks/useVoiceCatalog.ts
- TTS/playback request paths
- server TTS endpoints/config surfaces
- playback UI
- any error handling already present

Implementation requirements:
1. Distinguish recoverable vs non-recoverable playback failures where practical
2. Provide clear user-visible messaging
3. Do not leave stuck loading or phantom playback state
4. Keep scope narrow
5. Add focused regression coverage where practical

Expected output format:
Return:

## Plan
## Changes Made
## Validation

Spec 9: Productionize PDF export behavior

Recommended Codex reasoning level: high

You are working in the Script Seance repository.

Task:
Harden the PDF export path for production readiness.

Goal:
The export flow should be reliable, explicit in failure states, and realistic about browser support and limitations.

Context:
- A working iframe-based print/export path already exists.
- This task is not to redesign export from scratch unless clearly necessary.
- Keep the on-screen screenplay fidelity requirement intact.

Scope:
- export reliability
- graceful failure handling
- browser-support realism
- minimal UX hardening
- focused regression coverage

Do not:
- redesign screenplay rendering
- replace export architecture without a strong reason
- make unrelated workspace changes

What to inspect:
- services/scriptPdfExport.ts
- hooks/useStoryWorkspace.tsx
- components/ScriptDisplay.tsx
- current PDF export tests
- any browser-specific assumptions

Implementation requirements:
1. Export must fail visibly, not silently
2. Unsupported or fragile cases should be handled honestly
3. Repeated exports should remain stable
4. The flow should remain lazy and not affect startup
5. Keep screenplay fidelity intact
6. Add/update focused tests where practical

Expected output format:
Return:

## Plan
## Changes Made
## Validation

Spec 10: Freeze flows, then expand Playwright coverage

Recommended Codex reasoning level: high

You are working in the Script Seance repository.

Task:
Expand end-to-end coverage for the real launch paths now that the major flows are settled.

Goal:
Add Playwright coverage for the production-critical user paths without baking in unstable or soon-to-change behavior.

Important constraints:
- Assume upstream auth/session/failure-path decisions are already implemented.
- Do not write speculative tests for flows still in motion.
- Prefer a small, high-value E2E suite over broad brittle coverage.

What to inspect:
- current Playwright specs
- playwright.config.ts
- launch-critical flows from docs/productionChecklist.md and docs/Production Execution Seq.md
- auth/session flow
- generate first scene
- generate next scene
- audio/TTS critical path if in launch scope
- PDF export path if in launch scope

Implementation requirements:
1. Cover the real happy path
2. Cover the most important recoverable failure paths
3. Avoid over-testing motion or styling details
4. Keep fixtures and mocks maintainable
5. Do not create flaky timing-dependent tests

Expected output format:
Return:

## Plan
## Changes Made
## Validation

Recommended execution order

Run them in this order:
	1.	Spec 1 topology
	2.	Spec 2 auth/session design
	3.	Spec 3 CI + env validation
	4.	Spec 4 health/readiness + shutdown
	5.	Spec 5 draft durability strategy
	6.	Spec 6 session UX hardening
	7.	Spec 7 fatal-error recovery
	8.	Spec 8 TTS outage UX
	9.	Spec 9 PDF export hardening
	10.	Spec 10 Playwright expansion

Best practical way to use these

Do not toss all ten into Codex like bread crumbs into a tornado. Run them as a staged chain:
	•	first use Specs 1, 2, and 5 to settle the major product/architecture decisions
	•	then execute Specs 3 and 4
	•	then do the user-facing hardening with 6 through 9
	•	finish with 10

If you want, I can turn these into a Phase 1 only pack first, with the prompts tightened so they reference your exact repo files and current app behavior even more aggressively.
