# Repo Audit

Use this skill when the user wants a disciplined inspection before implementation, or wants to understand the safest way to approach a change.

## Goal

Map the true ownership points, relevant files, and risk boundaries before code is changed.

## Required workflow

1. Start with the smallest likely file set.
2. Inspect only the most relevant files first.
3. Expand file inspection only when the first pass justifies it.
4. Identify:
   - ownership boundaries
   - state flow
   - entry points
   - dependency edges
   - likely risk areas
5. Distinguish between:
   - direct change files
   - context files
   - files that should not be touched
6. Recommend the smallest safe patch path.

## Audit principles

- Do not infer architecture from filenames alone.
- Prefer understanding current patterns over proposing idealized redesigns.
- Preserve mainline architecture over side-branch experimentation.
- Flag over-containerization, duplicated UI systems, dead residue, and accidental complexity where relevant.

## When to use a two-file-first workflow

Use a strict two-file-first pass when:

- the task is potentially broad
- the feature spans multiple panes/components
- the user explicitly wants disciplined inspection before implementation
- there is risk of wandering into unnecessary files

## Output

Return:

### Diagnosis

### Files inspected first

### Why those files

### Ownership boundaries

### Likely direct change files

### Files to avoid touching

### Risks

### Recommended minimal patch path
