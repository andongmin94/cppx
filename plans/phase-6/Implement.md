# Phase 6 Implement

## Source of truth

This file follows `Plan.md` in the same directory.

## Goal summary

Enable native host build/run/test/pack on Windows, macOS, and Linux without attempting full foreign-target cross-compilation.

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

1. M1 — Implement Darwin and Linux adapters
2. M2 — Enable native compiler and tool discovery on macOS/Linux
3. M3 — Add multi-OS smoke validation

## Expected files to touch

- platform adapter files
- path resolution files
- tests
- `packages/src/main/cppx/installers.ts`
- `packages/src/main/cppx/project.ts`
- `packages/src/main/cppx/service.ts`
- `.github/workflows/...`
- sample/fixture projects
- docs

## Scope guardrails

- No universal binary, notarization, or code-signing polish.
- No mobile, embedded, or remote toolchain support.
- No promise of full cross-compile run/test parity.

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
