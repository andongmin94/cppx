# Batch B Implement

## Source of truth

This file follows `Plan.md` in the same directory.

## Goal summary

Introduce schema v2 and a configurable tool catalog/install policy without breaking existing Windows users.

## Operating rules

- Execute exactly Batch B.
- Do not begin Batch C.
- Run validations after each milestone.
- Fix failures before continuing.
- Keep the config surface backward compatible.

## Milestone execution order

1. M1 - Config schema v2 model and normalization
2. M2 - Parsing and write/read compatibility
3. M3 - Tool catalog and version/install policy
4. M4 - Manifest/status/CLI integration for tool policy

## Expected files to touch

- config parsing/model files under `packages/src/main/cppx/`
- `packages/src/shared/contracts.ts`
- `packages/src/main/cli.ts`
- `packages/src/main/cppx/service.ts`
- `packages/src/main/cppx/installers.ts`
- tool manifest/types/catalog files
- CLI/status-related files
- tests and fixtures

## Scope guardrails

- No backend abstraction yet.
- No preset matrix generator rewrite yet.
- No macOS/Linux enablement.
- No renderer-first work.

## Stop-and-fix rule

Stop when schema changes threaten backward compatibility, validation fails, or the next required change belongs to Batch C.
