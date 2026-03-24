# Phase 1 Implement

## Source of truth

This file follows `Plan.md` in the same directory.

## Goal summary

Introduce a host/platform adapter layer that centralizes Windows assumptions without yet enabling real macOS/Linux support.

## Operating rules

- Execute exactly this phase and nothing beyond it.
- Complete one milestone at a time.
- Run the milestone validations after each milestone.
- If validation fails, fix the failure before moving on.
- Keep diffs tightly scoped to the files and behaviors named in `Plan.md`.
- Update docs/tests only when required by this phase.
- Preserve current Windows behavior unless the phase explicitly changes platform support.
- Final report must include:
  1. changed files
  2. key design decisions
  3. validations run and results
  4. backward-compatibility impact
  5. remaining risks

## Milestone execution order

1. M1 — Inventory and protect OS-specific behavior
2. M2 — Add host platform types and Windows adapter
3. M3 — Wire remaining host-specific code through the adapter

## Expected files to touch

- `packages/src/main/cppx/paths.ts`
- `packages/src/main/cppx/installers.ts`
- `packages/src/main/cppx/project.ts`
- `packages/package.json`
- related tests
- new platform files under `packages/src/main/cppx/platform/`
- related core entrypoints
- tests as needed

## Scope guardrails

- No actual macOS/Linux native support yet.
- No dependency backend abstraction.
- No config schema redesign.
- No preset matrix work.
- No renderer-focused work.

## Stop-and-fix rule

Stop and repair before continuing when:
- a validation command fails
- the next required change clearly belongs to another phase
- a refactor would weaken current Windows behavior without explicit scope
- missing validation infrastructure makes the phase plan inaccurate

## Work log

- [ ] M1 complete
- [ ] M2 complete
- [ ] M3 complete

## Notes

- Keep `AGENTS.md` and phase boundaries in view while working.
- Re-read `Request.md` if scope starts to drift.
