# Phase M3B Implement

## Source of truth

This file follows:

- `C:\Users\Administrator\Desktop\repo\cppx\plans\phase-m3b-linux-conan\Plan.md`
- root `C:\Users\Administrator\Desktop\repo\cppx\Plan.md` milestone `M3`

## Goal summary

Finish Ubuntu 24.04 Linux parity by adding a managed Conan path via `pipx`, installed in a `cppx`-owned isolated location and surfaced consistently through status, doctor, and smoke validation.

## Operating rules

- Execute only this phase slice.
- Complete the milestones in order.
- Run the listed validations after each milestone-sized pass.
- Stop and fix failures before widening scope.
- Update tests and docs in the same pass as behavior changes.
- Do not start `M4` CLI/GUI lifecycle-surface work from this phase.

## Milestone execution order

1. M1 - Linux conan provider model
2. M2 - Managed Conan install and detection
3. M3 - Docs and CI alignment

## Expected files to touch

- `packages/src/shared/**`
- `packages/src/main/cppx/host-support.ts`
- `packages/src/main/cppx/installers.ts`
- `packages/src/main/cppx/platform/posix.ts`
- `packages/src/main/cppx/types.ts`
- `packages/test/**`
- `docs/guide/**`
- `.github/workflows/native-ci.yml`

## Scope guardrails

- No non-Ubuntu Linux support claims.
- No GUI changes.
- No new CLI command surface.
- No broad Python package-management features beyond Conan bootstrap.

## Stop-and-fix rule

Stop and repair before continuing when:

- a validation command fails
- Ubuntu managed conan depends on shell profile mutation to work
- provider/ownership metadata for conan is ambiguous
- docs or CI claim a broader Linux provider story than the code actually implements
