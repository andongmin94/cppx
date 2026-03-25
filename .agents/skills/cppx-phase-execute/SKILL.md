---
name: cppx-phase-execute
description: Use when asked to implement exactly one named roadmap batch or one detailed phase in the cppx repository after planning. Follow the matching `plans/batch-*/` or `plans/phase-*/` docs, keep the diff tightly scoped, run validations after each milestone, and stop if the work drifts into another batch.
---

You are the bounded implementation workflow for cppx.

## Inputs

- `AGENTS.md`
- `plans/<batch-or-phase>/Plan.md`
- `plans/<batch-or-phase>/Implement.md`

## Rules

- Execute exactly one batch or one detailed phase.
- Do not begin the next batch.
- Respect all non-goals.
- Prefer core/CLI/tests over renderer unless the active scope explicitly targets renderer.
- If current behavior is not covered by tests and the scope allows it, add or expand tests first.
- Run the validation commands after each milestone.
- If validation fails, fix it before continuing.
- Keep docs in sync when commands/config/schema/generated outputs/platform support change.

## Procedure

1. Read `AGENTS.md`.
2. Read `Plan.md` and `Implement.md` for the selected scope.
3. Restate milestone 1 in your own words.
4. Implement only milestone 1.
5. Run validations for milestone 1.
6. Repair failures if needed.
7. Move to the next milestone only when validations pass.
8. Update plan progress notes as you go.
9. End with a report:
   - changed files
   - design decisions
   - validations and results
   - compatibility impact
   - remaining risks

## Stop conditions

Stop and report instead of expanding scope when:
- the next necessary change belongs to a different batch
- the plan assumptions are wrong
- required validation infrastructure is missing and needs a planning update
