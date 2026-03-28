---
paths:
  - "tests/**"
  - "__tests__/**"
  - "*.test.ts"
  - "*.test.tsx"
  - "*.spec.ts"
  - "*.spec.tsx"
---

# Test rules

Update tests only where behavior actually changed. Do not rewrite unrelated tests while fixing one issue.

When a bug or UI issue is fixed: check whether nearby coverage already exists, prefer extending it, and add the narrowest regression test that would have caught the bug. Avoid over-mocking when the real behavior can be exercised cheaply.

Assert visible behavior and user-observable outcomes, not internal implementation details. For backend tests, assert contracts at the real ownership boundary — do not duplicate implementation logic in test form.

Prefer semantic queries over brittle selectors. Do not lock in cosmetic markup that is likely to move.

Do not create large snapshots for small fixes. Do not refresh snapshots casually. If a snapshot must change, explain why.

For regressions, add focused coverage when feasible rather than relying only on manual retest. Do not describe a fix as complete unless test results, lint, and typecheck status are all reported explicitly.
