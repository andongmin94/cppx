# Phase 3 Implement

## Source of truth

This file follows `Plan.md` in the same directory.

## Goal summary

Remove hardcoded tool-version assumptions from core logic and introduce tool catalog plus install policy concepts.

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

1. M1 — Define catalog and policy model
2. M2 — Move hardcoded tool sources into catalog-driven resolution
3. M3 — Expose policy choices through status/install flows

## Expected files to touch

- tool policy/type files
- catalog module or data files
- tests
- `packages/src/main/cppx/installers.ts`
- new catalog files
- manifest-related files
- CLI/service/status-related files
- manifest files
- docs/tests

## Scope guardrails

- No dependency backend abstraction yet.
- No preset matrix rewrite.
- No macOS/Linux native support activation.
- No large renderer work.

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
