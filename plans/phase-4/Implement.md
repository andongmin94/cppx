# Phase 4 Implement

## Source of truth

This file follows `Plan.md` in the same directory.

## Goal summary

Break the hard coupling to vcpkg and introduce dependency backend abstraction for `vcpkg`, `conan`, and `none`.

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

1. M1 — Define backend abstraction and move types
2. M2 — Implement backend-specific generation hooks
3. M3 — Make CLI/service flows backend-aware

## Expected files to touch

- `packages/src/main/cppx/types.ts`
- new backend interface files
- config-related types
- tests
- backend implementation files
- `packages/src/main/cppx/project.ts`
- service/command files
- tests/fixtures
- `packages/src/main/cli.ts`
- `packages/src/main/cppx/service.ts`
- backend and tests/docs files

## Scope guardrails

- No macOS/Linux host enablement.
- No preset matrix completion.
- No GUI-first work.
- No attempt at perfect Conan coverage in one step.

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
