# Phase 5 Plan — data-driven preset matrix

## Goal

Replace fixed debug/release preset generation with a data-driven preset matrix while keeping backward-compatible defaults.

## Non-goals

- No full foreign-target cross-compile support.
- No macOS/Linux native host enablement in this phase.
- No large renderer redesign.

## Milestones

### M1 — Map current preset assumptions and define matrix model

**Scope**

- List current assumptions around `debug-x64` and `release-x64`.
- Define how schema v2 preset entries map to configure/build/test/package presets.
- Define `runnable_on_host` behavior.

**Expected files**

- preset-related type/model files
- tests/fixtures
- plan notes

**Acceptance criteria**

- There is a clear matrix model.
- Backward-compatible default behavior is specified.

**Validation commands**

- `cd packages && npm run typecheck`
- `cd packages && npm run test`

### M2 — Implement data-driven preset generation

**Scope**

- Read `[[presets]]` from normalized config.
- Generate configure/build/test/package presets from the preset list.
- Fall back to existing defaults when no custom presets are declared.

**Expected files**

- `packages/src/main/cppx/project.ts`
- config consumers
- tests/snapshots

**Acceptance criteria**

- Custom presets can be declared without hand-editing generated files.
- Existing projects still get `debug-x64` and `release-x64` defaults.

**Validation commands**

- `cd packages && npm run typecheck`
- `cd packages && npm run test`

### M3 — Update run/test/pack and VSCode generation for matrix behavior

**Scope**

- Make VSCode tasks/launch generation data-driven.
- Respect `runnable_on_host` in run flows.
- Add examples such as `asan`, `release-lto`, or `arm64`.

**Expected files**

- VSCode generation logic
- run/test/pack flows
- tests/docs/fixtures

**Acceptance criteria**

- Run fails clearly for non-runnable presets.
- VSCode artifacts reflect the matrix.
- Example presets are covered by tests or docs.

**Validation commands**

- `cd packages && npm run typecheck`
- `cd packages && npm run test`

## Backward compatibility

- If no presets are declared, current defaults must continue to exist.
- Existing users should not need to hand-edit generated preset files for normal customization.
- Preset names or launch task assumptions should remain compatible where possible.

## Risks / open questions

- Run/test/pack code may assume Windows executable naming that gets revisited again in Phase 6.
- VSCode generation may be more coupled to current preset names than expected.
- Snapshot churn can hide unintended changes if not reviewed carefully.
