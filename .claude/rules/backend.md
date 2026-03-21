# Backend rules

Apply these rules when editing backend code such as:

- `server/**`
- `api/**`
- `routes/**`
- `services/**`
- `db/**`
- `prisma/**`
- `lib/**` when used by server paths
- `*.ts` files that power backend behavior

## Primary goal

Produce the smallest safe backend change with clear behavior, minimal risk, and no accidental architectural drift.

## Core principles

- Preserve working request/response contracts unless the task explicitly changes them.
- Prefer modifying an existing path over introducing a parallel path.
- Avoid new abstractions unless repeated complexity clearly justifies them.
- Keep side effects explicit.
- Keep validation, auth, and persistence logic easy to trace.

## Investigation rules

Before changing backend logic:

1. Identify the entry point.
2. Identify the ownership boundary for the behavior.
3. Identify upstream callers and downstream effects.
4. Check whether the change touches:
   - auth/session
   - persistence
   - validation
   - environment/config
   - external APIs
   - background jobs
5. Do not patch until the true ownership point is identified.

## API and service rules

- Preserve existing response shape unless explicitly asked to change it.
- Do not silently rename fields.
- Prefer narrow service changes over cross-cutting rewrites.
- Keep validation near the boundary where data enters the system.
- Keep error handling specific and useful.
- Avoid adding fallback logic that hides real problems.

## Database and persistence rules

- Treat schema, migrations, and data-shape changes as high risk.
- Do not make schema changes unless the task clearly requires them.
- If a migration is necessary, state the impact explicitly.
- Do not assume dashboard data is current; reason from actual code paths and data sources.
- Prefer safe, explicit queries over clever compactness.

## Config and environment rules

- Flag any required env/config changes explicitly.
- Remove stale config only if you can confirm it is unused.
- Be cautious with URLs, deployment wiring, auth secrets, and provider settings.
- Distinguish between active config, dormant config, and dead residue.

## Cleanup rules

When asked to remove stale framework/provider references:

- Check imports
- Check config
- Check env usage
- Check conditional branches
- Check type definitions
- Check documentation/comments
- Check tests
- Check UI labels that imply backend support

Classify each hit as:

- active
- dead
- ambiguous

## What to avoid

- Broad refactors during bug fixes
- Hidden behavior changes
- “Temporary” fallback branches that become permanent
- New dependencies for simple internal logic
- Reorganizing files without a clear payoff

## Validation rules

After a backend change:

- Run the narrowest relevant validation first.
- Report exactly what was run.
- Note anything not validated.
- If runtime validation is not possible, explain the specific gap.

## Backend validation

- For bug fixes, prefer the owning layer over symptom masking.
- Before deleting or bypassing logic, verify live references with repo search and report the result.
- When response validation fails, inspect both the prompt/producer and the schema/validator before patching.

## Expected output format

### Diagnosis

### Files inspected

### Root ownership point

### Patch plan

### Risks

### Validation
