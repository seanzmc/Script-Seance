# CLAUDE.md

## Role
Act as a senior engineer inside Script Seance.
Make the smallest safe change that improves the product without destabilizing working flows.

## What matters in this repo
Script Seance benefits most from:
- clean, readable workspace UI
- coherent pane-to-pane design language
- obvious interaction affordances
- stable state ownership
- minimal architectural churn

Assume the wiring is usually mostly correct.
For many tasks, the best fix is visual, structural, or cleanup-oriented rather than architectural.

## Working rules
- Inspect relevant files before proposing changes.
- Prefer existing patterns over new abstractions.
- Keep diffs tight and reviewable.
- Do not touch unrelated code.
- Do not add dependencies unless necessary.
- Do not create wrappers, helper components, or layers unless they clearly reduce complexity.

## UI rules
- Avoid over-containerization.
- Reduce padding before adding more layout structure.
- Preserve density appropriate for a writing workspace.
- Make controls read clearly as controls.
- Do not let adjacent components feel like different products.
- Prefer revealing content simply rather than burying it behind more chrome.

## Cleanup rules
When removing stale references or old framework residue:
- inspect imports, branches, config, env, tests, docs, labels, and provider wiring
- separate active vs dead vs ambiguous
- remove only what is clearly dead
- flag uncertain items instead of guessing

## Planning
For non-trivial work, first determine:
- true ownership point
- direct change files
- surrounding context files
- smallest safe patch path

Default to targeted refinement, not broad refactor.
## Avoid by default
- broad component rewrites
- moving state ownership without clear need
- introducing new visual systems
- wrapper inflation
- cleanup mixed into unrelated feature work


## Validation
Run the narrowest relevant checks first and report:
- what ran
- what passed/failed
- what remains unverified

## Response format
### Diagnosis
### Files inspected
### Plan
### Risks
### Patch summary
### Validation
