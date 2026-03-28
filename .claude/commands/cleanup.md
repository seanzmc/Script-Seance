# Dead Code Cleanup

Remove stale references, dead branches, phantom framework remnants, or dormant provider wiring.

$ARGUMENTS

## Process

1. Identify the target system, framework, or feature to clean.
2. Search all reference types: imports, types, config, env usage, conditional branches, provider wiring, tests, comments, and UI labels.
3. Classify every hit as **active**, **dead**, or **ambiguous**.
4. Do not remove ambiguous items — flag them.
5. Remove dead references in safe order:
   - dead comments/docs → unused imports/types → dead UI labels → unreachable branches → obsolete helpers → config/env residue → package dependencies
6. Validate that live paths still work after removal.

## Output

### Active references
### Dead references
### Ambiguous references (with reasoning)
### Removal plan
### Validation checklist
