# Plans directory

This overlay supports two operating levels.

## Recommended: batch level

Use these first:

- `plans/batch-a`
- `plans/batch-b`
- `plans/batch-c`
- `plans/batch-d`
- `plans/batch-e`

Each batch directory contains:

- `Plan.md` — scope, milestones, validations, acceptance criteria
- `Implement.md` — execution rules and milestone order
- `Request.md` — a ready-to-paste Codex prompt for that batch

## Optional: detailed phase level

Use these only when you want tighter control inside the current batch:

- `plans/phase-0` ~ `plans/phase-7`

Phase docs are detailed references. They do **not** override the active batch boundary.

## Mapping

- Batch A = Phase 0 + Phase 1
- Batch B = Phase 2 + Phase 3
- Batch C = Phase 4 + Phase 5
- Batch D = Phase 6
- Batch E = Phase 7
