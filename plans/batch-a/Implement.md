# Batch A Implement

## Source of truth

This file follows `Plan.md` in the same directory.

## Goal summary

Add test/CI safety rails and extract host-specific behavior behind an adapter while preserving current Windows behavior.

## Operating rules

- Execute exactly Batch A.
- Do not begin Batch B.
- Complete one milestone at a time.
- Run validations after each milestone.
- Fix failures before moving on.
- Final report must include changed files, design decisions, validations, compatibility impact, and remaining risks.

## Milestone execution order

1. M1 — Validation baseline
2. M2 — Characterization tests for current Windows-first behavior
3. M3 — Host adapter scaffold
4. M4 — Route Windows-specific behavior through the adapter

## Expected files to touch

- `packages/package.json`
- test config / test files / fixtures under `packages/`
- `packages/src/main/cppx/paths.ts`
- `packages/src/main/cppx/installers.ts`
- `packages/src/main/cppx/project.ts`
- new platform/adapter files under `packages/src/main/cppx/`
- `.github/workflows/...`

## Scope guardrails

- No schema v2 work.
- No tool catalog/version policy work.
- No backend abstraction.
- No preset matrix redesign.
- No macOS/Linux feature enablement.
- No renderer redesign.

## Stop-and-fix rule

Stop when a validation fails, scope drifts into Batch B, or Windows compatibility would be weakened.
