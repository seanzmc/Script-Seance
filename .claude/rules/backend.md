---
paths:
  - "server/**"
---

# Backend rules

The Express server is a stateless AI proxy and static file server. There is no database or ORM. Persistence is client-side localStorage.

Before changing backend logic: identify the entry point, the ownership boundary, upstream callers, and downstream effects. Check whether the change touches auth/session, validation, env/config, or external API contracts. Do not patch until the true ownership point is identified.

## API contracts

Preserve existing response shapes unless explicitly asked to change them. Do not silently rename fields. Keep validation near the boundary where data enters the system. Keep error handling specific — avoid fallback logic that hides real problems.

## Config and environment

Flag any required env/config changes explicitly. Do not remove env references unless you can confirm they are unused. Distinguish between active config, dormant config, and dead residue. See README.md for the full env var inventory.

## Cleanup discipline

When removing stale references: check imports, config, env usage, conditional branches, type definitions, tests, and documentation. Classify each hit as active, dead, or ambiguous. Remove only what is clearly dead. Flag ambiguous items.
