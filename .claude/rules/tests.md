# Test rules

Apply these rules when editing:

- `tests/**`
- `__tests__/**`
- `*.test.ts`
- `*.test.tsx`
- `*.spec.ts`
- `*.spec.tsx`

## Primary goal

Keep tests focused, durable, and aligned to actual behavior changes.

## Core principles

- Update tests only where behavior changed.
- Prefer focused regression coverage over broad snapshot churn.
- Do not rewrite unrelated tests while fixing one issue.
- Prefer explicit assertions over vague coverage.

## Test strategy

When a bug or UI issue is fixed:

1. Identify whether test coverage already exists nearby.
2. Prefer extending an existing relevant test.
3. Add the narrowest regression test that would have caught the bug.
4. Avoid over-mocking if the real behavior can be exercised cheaply.

## UI test guidance

- Assert visible behavior, not internal implementation details.
- Prefer user-observable outcomes.
- Avoid brittle selectors when stronger semantic queries are available.
- Do not lock in cosmetic markup that is likely to move.

## Backend test guidance

- Assert contract and behavior at the real ownership boundary.
- Avoid tests that merely duplicate implementation.
- Keep mocks minimal and purposeful.
- Be explicit about failure paths where relevant.

## Snapshot guidance

- Do not create large snapshots for small fixes.
- Do not refresh snapshots casually.
- If a snapshot must change, explain why it changed.

## What to avoid

- Test rewrites unrelated to the task
- Overly broad end-to-end coverage for small local fixes
- Assertions that encode current implementation structure instead of behavior
- Fake coverage that would not catch the real regression

## Validation reporting

Always report:

- which tests were run
- whether they passed or failed
- whether there are untested risk areas

## Completion gate

- Do not describe a fix as complete unless test, lint, and typecheck status are reported explicitly.
- For regressions, add focused coverage when feasible rather than relying only on manual retest.

## Expected output format

### Behavior change

### Test impact

### Test updates

### Validation run

### Remaining risk
