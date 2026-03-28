# Audit

Map ownership, risk boundaries, and the safest patch path before writing any code.

$ARGUMENTS

## Process

1. Start with the two most likely files. Do not scatter across the repo.
2. Inspect those files and identify:
   - entry points and ownership boundaries
   - state flow and dependency edges
   - direct change files vs. context-only files vs. files that should not be touched
3. Expand inspection only if the first pass justifies it. State why.
4. Classify the issue and recommend the smallest safe patch path.

## Output

### Diagnosis
### Files inspected (and why those first)
### Ownership boundaries
### Direct change files
### Files to avoid touching
### Risks
### Recommended patch path

Do not implement anything. This is inspection only.
