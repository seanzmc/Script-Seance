# AGENTS.md

## Purpose

This file defines the default workflow for AI/code agents operating in this workspace.
Use these rules unless the user explicitly overrides them.

## Workspace Baseline

- Run commands from the repository root.
- Use `pnpm` (not `npm` or `yarn`).
- Prefer minimal, targeted changes over broad refactors.
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

## Recommended Execution Flow

1. Understand the request and identify impacted files.
2. Implement the smallest correct change.
3. Run targeted checks first when useful (example: specific test file).
4. Run full mandatory gates:
   1. `pnpm typecheck`
   2. `pnpm lint`
   3. `pnpm test`
5. If behavior/build tooling changed, additionally run:

```bash
pnpm build
```

## Testing And Validation Rules

- For bug fixes, add or update a regression test when feasible.
- For new behavior, add tests that cover success and at least one failure/edge path.
- Do not remove tests to make the suite pass unless explicitly requested.
- Prefer deterministic tests; avoid time/network flakiness.

## Code Quality Rules

- Keep TypeScript strictness intact; avoid introducing `any` without clear need.
- Avoid `// @ts-ignore`; if unavoidable, document why inline.
- Reuse existing patterns before introducing new abstractions.
- Keep public contracts stable unless the task explicitly requires breaking changes.

## Dependency And Config Changes

- Do not add dependencies unless necessary for the task.
- If adding/changing a dependency or script, explain why in the final handoff.
- Update relevant docs (`README.md`, `docs/*`) when developer workflow or behavior changes.

## Handoff Format (Every Task)

When reporting completion, include:

- What changed (files + behavior impact).
- Mandatory gate results for `test`, `lint`, and `typecheck`.
- Any residual risks, assumptions, or follow-up work.

## Escalation

If blocked (missing env vars, external service outage, ambiguous requirements), state:

- exact blocker,
- what was attempted,
- the smallest decision/input needed to proceed.
