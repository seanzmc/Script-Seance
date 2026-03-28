# Diagnose

Investigate the problem or area described below. Do not jump to a fix.

$ARGUMENTS

## Process

1. **Diagnosis** — State the root cause in 1–3 sentences. Distinguish symptoms from the actual ownership point.
2. **Files inspected** — List every file you read and why. If you haven't read enough to be confident, say so and stop here.
3. **Plan** — Describe the smallest safe patch path. Identify direct change files and surrounding context that must stay stable.
4. **Risks** — Call out anything this change could destabilize: adjacent UI, generation flow, orchestration receipts, auth, TTS, test coverage.
5. **Patch summary** — Describe (do not implement) the concrete edits, file by file.
6. **Validation** — State which of `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:playwright` apply and whether any manual check is also needed.

Do not implement anything. Wait for approval before writing code.
