# Batch A Plan — Phase 0 + Phase 1

## Goal

Create a safe Windows baseline for future refactors by adding tests/CI and extracting host-specific behavior behind an adapter without changing user-visible Windows behavior.

## Non-goals

- No config schema redesign.
- No tool catalog/version policy work.
- No dependency backend abstraction.
- No preset matrix redesign.
- No macOS/Linux feature enablement yet.
- No renderer redesign.

## Milestones

### M1 — Validation baseline

**Scope**
- Add a repo-standard test runner and baseline test command.
- Keep current behavior unchanged.
- Confirm existing typecheck/build commands.

**Acceptance criteria**
- `cd packages && npm run typecheck` passes.
- `cd packages && npm run test` exists and runs.

**Validation commands**
- `cd packages && npm run typecheck`
- `cd packages && npm run test`

### M2 — Characterization tests for current Windows-first behavior

**Scope**
- Lock current config read/write behavior.
- Lock current generated artifacts.
- Lock current path, tool-root, and run/test/pack behavior.

**Acceptance criteria**
- Current behavior is covered by tests or golden files.
- Generated outputs are intentionally locked before refactor.

**Validation commands**
- `cd packages && npm run test`
- `cd packages && npm run typecheck`

### M3 — Host adapter scaffold

**Scope**
- Introduce host platform typing and a host adapter interface.
- Centralize Windows assumptions instead of scattering them.

**Acceptance criteria**
- New adapter types exist.
- Core code can depend on adapter abstractions instead of raw Windows constants in multiple places.

**Validation commands**
- `cd packages && npm run typecheck`
- `cd packages && npm run test`

### M4 — Route Windows-specific behavior through the adapter

**Scope**
- Move host-specific logic from paths/installers/project/run-test-pack helpers behind the adapter.
- Preserve current Windows behavior.
- Add minimal Windows CI.

**Acceptance criteria**
- Adapter owns key Windows-specific assumptions such as executable suffixes and app data root logic.
- Windows CI runs the agreed validation commands.
- Existing Windows behavior remains intact.

**Validation commands**
- `cd packages && npm run typecheck`
- `cd packages && npm run test`
- review workflow YAML for `windows-latest`

## Backward compatibility

- Existing Windows users should see no intentional workflow breakage.
- Generated artifacts should not change except where tests explicitly lock and justify them.

## Risks / open questions

- Some current behavior may be difficult to test without extracting pure helpers.
- Adapter work may reveal more Windows assumptions than expected.
