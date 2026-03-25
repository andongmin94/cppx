# Phase M3A Implement

## Source of truth

This file follows:

- `C:\Users\Administrator\Desktop\repo\cppx\plans\phase-m3a-linux-core-parity\Plan.md`
- root `C:\Users\Administrator\Desktop\repo\cppx\Plan.md` milestone `M3`

## Goal summary

Ship the first Linux parity slice by making Ubuntu 24.04 an official managed host for core build tools and `vcpkg`, while keeping unsupported distributions and Linux `conan` on explicit system fallback.

## Operating rules

- Execute only this phase slice.
- Complete the milestones in order.
- Run the listed validations after each milestone-sized code pass.
- Stop and fix failures before widening scope.
- Update tests and docs in the same pass as the behavior change.
- Do not start `M4` lifecycle-surface work from this phase.

## Milestone execution order

1. M1 - Official Ubuntu 24.04 host model
2. M2 - Linux managed install and resolution flow
3. M3 - Docs and CI alignment for the M3A slice

## Expected files to touch

- `packages/src/main/cppx/host-support.ts`
- `packages/src/main/cppx/installers.ts`
- `packages/src/main/cppx/platform/posix.ts`
- `packages/src/main/cppx/tool-catalog.ts`
- `packages/src/main/cppx/types.ts`
- `packages/test/**`
- `docs/guide/**`
- `.github/workflows/native-ci.yml`

## Scope guardrails

- No Linux distro expansion beyond Ubuntu 24.04.
- No Linux managed `conan` claim in this slice.
- No new CLI verbs or GUI actions.
- No destructive uninstall behavior changes.

## Stop-and-fix rule

Stop and repair before continuing when:

- a validation command fails
- Linux provider detection reports `apt` on unsupported hosts
- managed Linux resolution reuses a stale `system` record incorrectly
- CI/docs would claim broader Linux support than the code actually enforces
