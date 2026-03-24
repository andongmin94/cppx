# Phase 7 Implement

## Source of truth

This file follows `Plan.md` in the same directory.

## Goal summary

Wire the expanded core capabilities into the GUI and finish docs, migration guidance, and release flow.

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

1. M1 — Expose finished core capabilities in the GUI
2. M2 — Finish docs and migration guidance
3. M3 — Release and artifact polish

## Expected files to touch

- `packages/src/renderer/...`
- preload/IPC files if needed
- tests/docs
- `docs/...`
- root guidance files if needed
- release workflow/config files
- docs
- packaging metadata as needed

## Scope guardrails

- No new core architecture expansion unless needed to expose already-built features.
- No major UX redesign unrelated to roadmap completion.
- No reopening earlier phase scope without a clear bug fix.

## Stop-and-fix rule

Stop and repair before continuing when:
- a validation command fails
- the next required change clearly belongs to another phase
- a refactor would weaken current Windows behavior without explicit scope
- missing validation infrastructure makes the phase plan inaccurate

## Work log

- [x] M1 complete
- [x] M2 complete
- [ ] M3 complete

## Notes

- Keep `AGENTS.md` and phase boundaries in view while working.
- Re-read `Request.md` if scope starts to drift.
