# Phase 5 Implement

## Source of truth

This file follows `Plan.md` in the same directory.

## Goal summary

Replace fixed debug/release preset generation with a data-driven preset matrix while keeping backward-compatible defaults.

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

1. M1 — Map current preset assumptions and define matrix model
2. M2 — Implement data-driven preset generation
3. M3 — Update run/test/pack and VSCode generation for matrix behavior

## Expected files to touch

- preset-related type/model files
- tests/fixtures
- plan notes
- `packages/src/main/cppx/project.ts`
- config consumers
- tests/snapshots
- VSCode generation logic
- run/test/pack flows
- tests/docs/fixtures

## Scope guardrails

- No full foreign-target cross-compile support.
- No macOS/Linux native host enablement in this phase.
- No large renderer redesign.

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
