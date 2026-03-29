# AGENTS.md

## Mandatory Gates

Every task must pass all three before completion:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

If behavior or build tooling changed, also run pnpm build.
Never claim completion while any gate is failing or unrun.
If one fails, continue iterating until fixed or report a concrete blocker.

## Workspace

- Run commands from the repository root.
- Use pnpm (not npm or yarn).
- Use repo-relative paths, not absolute local paths.
- Only reference files confirmed to exist (or explicitly label as unknown).

## Task Rules

- Prefer minimal, targeted changes over broad refactors.
- Change only what the task requires — no drive-by cleanup.
- Do not modify unrelated files.
- Do not add dependencies unless necessary; explain in handoff if added.
- Keep diffs small and atomic — favor one concern per change.
- When requirements are ambiguous, restate the ambiguity and propose the safest interpretation before editing.
- Before deleting code, verify no live references with rg and cite the search result in handoff.
- Do not "improve" architecture, naming, or style unless explicitly part of the task.

## Spec-First Mode

Non-trivial tasks (touches >1 file, changes behavior, or adds/changes tests/config) require a spec before any edits:

1. Diagnosis — root cause, exact files to inspect, risk level, whether behavior-only / styling-only / mixed.
2. Exact files to change.
3. Constraints repeated back (preserve visuals, no refactor, no new deps, etc.).
4. Risks and non-goals.
5. Validation plan.

Wait for approval before implementing. Cite concrete files, symbols, and code paths — evidence over assumption. If risky, split into smaller approved steps.

## Code Quality

- Keep TypeScript strict; avoid any without clear need.
- Avoid // @ts-ignore; if unavoidable, document why inline.
- Reuse existing patterns before introducing new abstractions.
- Keep public contracts stable unless explicitly required to break them.
- New helpers stay narrow and local; broaden only after proven repeated use.

## Testing

- Bug fixes: add or update a regression test when feasible.
- New behavior: cover success + at least one failure/edge path.
- Do not remove tests to make the suite pass unless explicitly requested.
- Prefer deterministic tests; avoid time/network flakiness.
- Run targeted checks first (specific test file), then full gates.
- Do not claim a visual fix based only on unit tests if manual verification is pending.

## UI Safety

- Preserve current visuals unless the task explicitly requests a change.
- Distinguish between: same-role standardization, behavior fixes, visual restyling — do not collapse into one change.
- Fix bugs in the owning layer (state, controller, layout) rather than masking in the UI.
- For overlays/modals: verify z-index, viewport fit, scrollability, and first-paint positioning.
- For responsive changes: define the intended state progression in plain English before editing.

## Handoff (Every Task)

- What changed (files + behavior impact).
- What did not change (especially preserved behavior/visual constraints).
- Gate results: typecheck, lint, test.
- Manual verification still pending, if any.
- Residual risks or follow-up work.

## Escalation

If blocked, state: exact blocker, what was attempted, smallest decision or input needed to proceed.
