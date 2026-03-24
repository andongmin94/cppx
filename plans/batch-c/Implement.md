# Batch C Implement

## Source of truth

This file follows `Plan.md` in the same directory.

## Goal summary

Introduce backend abstraction and preset-matrix generation without breaking the current Windows vcpkg default workflow.

## Operating rules

- Execute exactly Batch C.
- Do not begin Batch D.
- Run validations after each milestone.
- Fix failures before continuing.
- Keep compatibility behavior explicit in tests and fixtures.

## Milestone execution order

1. M1 - Dependency backend abstraction and vcpkg compatibility
2. M2 - Minimal `conan` and `none` backends
3. M3 - Data-driven preset matrix generation
4. M4 - Preset-aware run/test/pack and VSCode integration

## Expected files to touch

- `packages/src/main/cppx/project.ts`
- `packages/src/main/cppx/config.ts`
- backend-specific files under `packages/src/main/cppx/`
- shared/core types if needed for backend/preset modeling
- tests and fixtures
- docs that describe backend and preset behavior

## Scope guardrails

- No macOS/Linux host enablement.
- No renderer-first work.
- No broad release/migration work outside Batch C.
- Do not redesign tool install policy introduced in Batch B.

## Stop-and-fix rule

Stop when a required change belongs to Batch D, backward compatibility with vcpkg/default presets becomes unclear, or validation fails.
