# AGENTS.md

## Purpose

This file defines the default workflow for AI/code agents operating in this workspace.
Use these rules unless the user explicitly overrides them.

## Workspace Baseline

- Run commands from the repository root.
- Use `pnpm` (not `npm` or `yarn`).
- Prefer minimal, targeted changes over broad refactors.
- Prefer preserving behavior and visuals unless the task explicitly calls for a change.
- Keep diffs reviewable: favor small, atomic tasks over bundled cleanup.
- When requirements are ambiguous, restate the ambiguity and propose the safest interpretation before editing.
- Do not infer hidden cleanup work from nearby code; change only what the task requires.
- Do not modify unrelated files.
- When referencing files, use repo-relative paths, not absolute local paths.
- Only list files you have confirmed exist (or explicitly label as ‘unknown’)

## Definition Of Success (Mandatory Gates)

A task is not successful until all three commands pass:

```bash
pnpm test
pnpm lint
pnpm typecheck
```

Requirements:

- All three must be green in the same final state of the working tree.
- If one fails, continue iterating until fixed or report a concrete blocker.
- Never claim completion while any of the three checks is failing or unrun.

## Spec-First Mode (Default)

- For non-trivial tasks, produce a spec first (no edits), then wait for approval.
- Non-trivial = touches more than 1 file or changes behavior or adds/changes tests/config.

## GPT-5.4 / Codex Prompting Rules

- Start with a short diagnosis before editing:
  - likely root cause,
  - exact files to inspect,
  - risk level,
  - whether the task is behavior-only, styling-only, or mixed.
- For implementation tasks, restate the task in one sentence before making changes.
- If the task has constraints (for example: preserve visuals, no refactor, no new dependencies), repeat those constraints back in the spec and honor them during implementation.
- Prefer evidence over assumption: cite concrete files, symbols, and code paths in the spec.
- When a task is risky, split it into smaller approved steps instead of doing a broad pass.
- Do not "improve" architecture, naming, or style unless that is explicitly part of the task.
- For UI work, distinguish between:
  - same-role standardization,
  - behavior fixes,
  - visual restyling.
  Do not collapse these into one change.
- For bug fixes, prefer fixing the root cause in the owning layer (state, controller, layout, event handling) rather than masking symptoms in the UI.
- Before deleting code, verify there are no live references with a repo search and mention the search result in the handoff.
- When changing responsive behavior, explicitly test the boundary widths called out by the task.
- When changing anchored popovers, modals, or overlays, verify first-paint positioning, layering, and interaction, not just static rendering.
- Keep new abstractions narrowly scoped. Prefer local constants/helpers over new global systems unless repeated usage clearly justifies a broader abstraction.

## Recommended Execution Flow

1. Understand the request and identify impacted files.
2. For non-trivial work, write a spec first with:
   1. diagnosis,
   2. exact files to change,
   3. risks,
   4. non-goals,
   5. validation plan.
3. Wait for approval when in spec-first mode.
4. Implement the smallest correct change.
5. Run targeted checks first when useful (example: specific test file).
6. Run full mandatory gates:
   1. `pnpm typecheck`
   2. `pnpm lint`
   3. `pnpm test`
7. If behavior/build tooling changed, additionally run:

```bash
pnpm build
```
8. In the final handoff, separate:
   1. what changed,
   2. what did not change,
   3. validation results,
   4. residual risk.

## Testing And Validation Rules

- For bug fixes, add or update a regression test when feasible.
- For new behavior, add tests that cover success and at least one failure/edge path.
- Do not remove tests to make the suite pass unless explicitly requested.
- Prefer deterministic tests; avoid time/network flakiness.
- For UI/layout changes, include a short manual verification checklist when browser-visible behavior matters.
- Do not claim a visual fix based only on unit/component tests if manual verification is still pending.
- When a task names specific breakpoints, states, or interaction paths, validate those exact conditions.

## Code Quality Rules

- Keep TypeScript strictness intact; avoid introducing `any` without clear need.
- Avoid `// @ts-ignore`; if unavoidable, document why inline.
- Reuse existing patterns before introducing new abstractions.
- Keep public contracts stable unless the task explicitly requires breaking changes.
- Prefer reusing existing local patterns before introducing a shared abstraction.
- When extracting a helper, keep the first extraction narrow; broaden it only after repeated use is proven.
- Avoid “drive-by” cleanup in files touched for another purpose.

## Dependency And Config Changes

- Do not add dependencies unless necessary for the task.
- If adding/changing a dependency or script, explain why in the final handoff.
- Update relevant docs (`README.md`, `docs/*`) when developer workflow or behavior changes.

## UI / Interaction Safety Rules

- Preserve current visuals unless the task explicitly requests a visual change.
- Standardize implementation, not appearance, unless appearance is part of the task.
- For responsive header/control changes, define the intended state progression in plain English before editing.
- For overlays and dialogs, verify z-index, viewport fit, scrollability, and first visible paint.
- Do not replace a working interaction model with a new one unless required by the task.
- If a status indicator appears conditionally, ensure it does not cause unwanted layout shift unless the task explicitly accepts that tradeoff.

## Handoff Format (Every Task)

- What changed (files + behavior impact).
- What did not change (especially preserved behavior/visual constraints).
- Mandatory gate results for `test`, `lint`, and `typecheck`.
- Targeted checks run, if any.
- Any manual verification still pending.
- Any residual risks, assumptions, or follow-up work.

## Escalation

If blocked (missing env vars, external service outage, ambiguous requirements), state:

- exact blocker,
- what was attempted,
- the smallest decision/input needed to proceed.
