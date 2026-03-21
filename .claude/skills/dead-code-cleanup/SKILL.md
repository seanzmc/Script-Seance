# Dead Code Cleanup

Use this skill when the user wants stale references, dead branches, phantom framework remnants, obsolete configs, unused imports, or dormant provider wiring removed.

## Goal

Remove dead residue safely without breaking live paths.

## Required workflow

1. Identify the target system, framework, library, provider, or feature.
2. Search for all references across:
   - imports
   - types
   - feature flags
   - config
   - env usage
   - provider wiring
   - conditional branches
   - tests
   - comments/docs
   - UI labels
3. Classify each reference as:
   - active
   - dead
   - ambiguous
4. Do not remove ambiguous items until their live status is understood.
5. Remove dead references in the safest order.
6. Validate that the current intended path still works.

## Cleanup principles

- Distinguish “unused now” from “required by current runtime.”
- Prefer deleting dead code over hiding it.
- Avoid cleanup that silently changes active behavior.
- Keep config cleanup explicit.
- Flag any follow-on cleanup that should be separate from the main patch.

## Safe removal order

Default order:

1. dead comments/docs
2. unused imports/types
3. dead UI labels/text
4. unreachable branches
5. obsolete helper utilities
6. config/env residue
7. package/dependency cleanup if clearly unused

## Output

Return:

### Active references

### Dead references

### Ambiguous references

### Safe removal plan

### Validation checklist
