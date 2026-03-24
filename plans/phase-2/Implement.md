# Phase 2 Implement

## Source of truth

This file follows `Plan.md` in the same directory.

## Goal summary

Replace or wrap the limited config parser with a schema v2 model while keeping existing config inputs working.

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

1. M1 — Define schema v2 and normalization strategy
2. M2 — Implement schema v2 parsing and normalization
3. M3 — Protect generated behavior during schema transition

## Expected files to touch

- config/type files under `packages/src/main/cppx/`
- plan notes and tests
- config parser/loader files
- related type files
- tests/fixtures
- generator-facing config consumers
- tests and snapshots
- docs if config examples changed

## Scope guardrails

- No dependency backend implementation yet.
- No preset matrix generation rewrite yet.
- No macOS/Linux support activation.
- No large renderer changes.

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
