# Batch D Implement

## Source of truth

This file follows `Plan.md` in the same directory.

## Goal summary

Enable native host workflows on Windows, macOS, and Linux while keeping Windows compatibility intact and staying honest about what still depends on host-installed tools.

## Operating rules

- Execute exactly Batch D.
- Do not begin Batch E.
- Run validations after each milestone.
- Fix failures before continuing.
- Prefer adapter-driven changes over scattered platform conditionals.

## Milestone execution order

1. M1 - Darwin/Linux adapters and host-native defaults
2. M2 - Native tool discovery and runtime flow on macOS/Linux
3. M3 - Multi-OS CI and smoke coverage

## Expected files to touch

- `packages/src/main/cppx/platform/*`
- `packages/src/main/cppx/config.ts`
- `packages/src/main/cppx/installers.ts`
- `packages/src/main/cppx/service.ts`
- `packages/src/main/cppx/project.ts`
- `packages/src/main/cppx/paths.ts`
- host-aware tests under `packages/test/`
- `.github/workflows/*`
- docs that describe supported hosts and prerequisites

## Scope guardrails

- No renderer redesign.
- No release polish beyond what Batch D needs for validation.
- No attempt to add full managed tool catalogs for macOS/Linux in this batch.
- No full cross-compilation feature work.

## Stop-and-fix rule

Stop when:

- a validation command fails
- a required change belongs to Batch E
- support claims are not backed by tests or CI coverage
- the next refactor would weaken Windows behavior without clear benefit
