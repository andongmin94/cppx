# Phase 0 Implement

## Source of truth

This file follows `Plan.md` in the same directory.

## Goal summary

Add a repeatable test runner, characterization tests, and minimal Windows CI so later refactors can be validated safely.

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

1. M1 — Establish baseline validation infrastructure
2. M2 — Characterization tests for current behavior
3. M3 — Minimal Windows CI

## Expected files to touch

- `packages/package.json`
- new test config files under `packages/`
- optional helper files for test bootstrapping
- test files under `packages/`
- fixture directories for sample cppx projects
- snapshot/golden files
- `.github/workflows/...`

## Scope guardrails

- No product feature changes.
- No host adapter extraction.
- No config schema redesign.
- No macOS/Linux support work.
- No renderer UX work except minimal testability helpers.

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
