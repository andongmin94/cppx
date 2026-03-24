# Phase 0 Plan — tests + Windows CI safety net

## Goal

Add a repeatable test runner, characterization tests, and minimal Windows CI so later refactors can be validated safely.

## Non-goals

- No product feature changes.
- No host adapter extraction.
- No config schema redesign.
- No macOS/Linux support work.
- No renderer UX work except minimal testability helpers.

## Milestones

### M1 — Establish baseline validation infrastructure

**Scope**

- Inspect existing `packages/package.json` scripts.
- Add a repo-standard test runner and `npm run test` under `packages/`.
- Create any minimal test setup/config files needed.
- Do not change behavior yet.

**Expected files**

- `packages/package.json`
- new test config files under `packages/`
- optional helper files for test bootstrapping

**Acceptance criteria**

- `cd packages && npm run typecheck` passes.
- `cd packages && npm run test` exists and runs.
- No intentional product behavior changes.

**Validation commands**

- `cd packages && npm run typecheck`
- `cd packages && npm run test`

### M2 — Characterization tests for current behavior

**Scope**

- Add tests that lock current config read/write behavior.
- Add tests or snapshots for generated `CMakeLists.txt`, `CMakePresets.json`, and `vcpkg.json`.
- Add tests for current path/tool-root resolution and run/test/pack path behavior.
- Use fixture/golden files where helpful.

**Expected files**

- test files under `packages/`
- fixture directories for sample cppx projects
- snapshot/golden files

**Acceptance criteria**

- Current generated artifacts are locked by tests.
- Current Windows-oriented path behavior is covered by tests.
- Tests document current behavior rather than redesigning it.

**Validation commands**

- `cd packages && npm run test`
- `cd packages && npm run typecheck`

### M3 — Minimal Windows CI

**Scope**

- Add GitHub Actions workflow for `windows-latest`.
- Install dependencies and run typecheck + tests.
- Keep CI intentionally minimal.

**Expected files**

- `.github/workflows/...`

**Acceptance criteria**

- Windows CI runs install, typecheck, and tests.
- CI mirrors repo-standard commands.

**Validation commands**

- review workflow YAML for Windows job correctness
- `cd packages && npm run typecheck`
- `cd packages && npm run test`

## Backward compatibility

- Current Windows behavior must remain unchanged.
- Generated outputs must not change unless they were already unstable and the change is explicitly justified.
- The new test command becomes the baseline for later phases.

## Risks / open questions

- Current code may be hard to unit test without extracting pure helpers.
- Some paths or generators may depend on environment-specific data and need fixtures or mocks.
- There may be no obvious test runner choice already used in the repo.
