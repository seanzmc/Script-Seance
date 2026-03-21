# Safe UI Patch

Use this skill when the task is a UI refinement, layout cleanup, interaction polish, or visual consistency pass in an existing codebase.

## Goal

Produce a minimal, architecture-preserving UI patch.

## Required workflow

1. Inspect the target component first.
2. Inspect the nearest parent, sibling, or shared primitive that appears to control layout or visual language.
3. Decide whether the issue is:
   - styling-only
   - structure-only
   - logic-linked
4. Identify the smallest patch that solves the real issue.
5. Prefer editing existing components over adding new wrappers or abstractions.
6. Preserve current state ownership unless change is truly required.
7. After patching, explain exactly what changed and why.

## Specific checks

Evaluate all of the following:

- over-containerization
- weak hierarchy
- excessive padding
- controls that do not look interactive
- competing visual systems within the same screen or pane
- content that could remain more visible with a lighter disclosure pattern
- opportunities to delete styling or wrappers instead of adding more

## Patch constraints

- Keep the diff tight and reviewable.
- No speculative redesigns.
- No new dependency for simple UI cleanup.
- No broad refactor unless explicitly requested.
- Preserve existing architecture and working behavior.

## Output

Return:

### Diagnosis

### Files inspected

### Minimal patch plan

### Risks

### Patch summary

### Validation
