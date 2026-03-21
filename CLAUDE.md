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

## Search and inspection rules
- Use `rg` as the default tool for codebase search instead of `grep`.
- Start with narrow, intentional searches before expanding scope.
- Prefer searching by component name, exported symbol, prop name, route, hook, or feature flag before reading whole directories.
- When auditing stale systems, search imports, types, config, env, provider wiring, tests, docs, and UI labels separately.
- Do not scan large portions of the repo without a clear reason.

## UI rules
- Avoid over-containerization.
- Reduce padding before adding more layout structure.
- Preserve density appropriate for a writing workspace.
- Make controls read clearly as controls.
- Do not let adjacent components feel like different products.
- Prefer revealing content simply rather than burying it behind more chrome.

## Local UI polish rule
For UI tasks, prefer the smallest coherent local polish pass over a literal symptom-only patch.
When a requested fix clearly exposes adjacent inconsistency in the same pane, same control family, or same interaction flow, include that cleanup in scope.
Do not broaden into unrelated redesign or app-wide refactor.

## Cleanup rules
When removing stale references or old framework residue:
- inspect imports, branches, config, env, tests, docs, labels, and provider wiring
- separate active vs dead vs ambiguous
- remove only what is clearly dead
- flag uncertain items instead of guessing

## Separation of concerns for tasks
- Keep visual consistency work separate from behavior/regression fixes unless the same ownership point clearly requires both.
- Do not mix setup-flow styling cleanup with generation pipeline changes in one patch unless explicitly requested.

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

## Repo execution rules
- Run commands from the repository root.
- Use `pnpm`, not `npm` or `yarn`.
- Use repo-relative paths in responses and handoffs.
- For non-trivial work, default to spec-first: inspect, write the spec, then wait for approval.
- Do not claim completion unless validation commands were actually run and reported explicitly.

## Validation expectations
For completed tasks, report the exact command(s) run.
If a task is claimed complete, final validation should include:
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`

## Validation command rules
- For final validation, run the repo scripts exactly as written:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test`
- Do not wrap, pipe, redirect, truncate, or chain these final validation commands.
- Do not replace repo validation scripts with underlying tool commands.
- Commands like `2>&1 | head -40`, `tee`, `tail`, or custom `tsc --noEmit` invocations are debug-only and do not count as final validation.
- `pnpm typecheck 2>&1 | head -40` does not count as running `pnpm typecheck`.

If any of these are unrun or failing, say so explicitly.

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
