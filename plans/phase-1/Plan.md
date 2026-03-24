# Phase 1 Plan — extract host-specific behavior behind an adapter

## Goal

Introduce a host/platform adapter layer that centralizes Windows assumptions without yet enabling real macOS/Linux support.

## Non-goals

- No actual macOS/Linux native support yet.
- No dependency backend abstraction.
- No config schema redesign.
- No preset matrix work.
- No renderer-focused work.

## Milestones

### M1 — Inventory and protect OS-specific behavior

**Scope**

- Identify Windows-specific assumptions in paths, installers, run/test/pack, and package scripts.
- Expand tests where refactoring risk is high.
- Document the inventory in code comments or plan notes.

**Expected files**

- `packages/src/main/cppx/paths.ts`
- `packages/src/main/cppx/installers.ts`
- `packages/src/main/cppx/project.ts`
- `packages/package.json`
- related tests

**Acceptance criteria**

- High-risk Windows assumptions are identified before refactoring.
- Tests cover the behavior that is about to move behind adapters.

**Validation commands**

- `cd packages && npm run typecheck`
- `cd packages && npm run test`

### M2 — Add host platform types and Windows adapter

**Scope**

- Introduce `HostPlatform` typing and a `HostAdapter` interface.
- Implement a Windows adapter first.
- Move path roots, executable suffix, PATH separator, and shell/bootstrap selection behind the adapter.

**Expected files**

- new platform files under `packages/src/main/cppx/platform/`
- `packages/src/main/cppx/paths.ts`
- related core entrypoints

**Acceptance criteria**

- Core no longer hardcodes many Windows constants directly.
- Windows adapter fully explains current behavior.

**Validation commands**

- `cd packages && npm run typecheck`
- `cd packages && npm run test`

### M3 — Wire remaining host-specific code through the adapter

**Scope**

- Update installers, project/run/test/pack behavior, and package scripts to rely on the adapter or cross-platform helpers.
- Reduce direct `.exe`, `cmd.exe`, `powershell`, and `LOCALAPPDATA` usage outside the adapter.
- Keep behavior unchanged.

**Expected files**

- `packages/src/main/cppx/installers.ts`
- `packages/src/main/cppx/project.ts`
- `packages/package.json`
- tests as needed

**Acceptance criteria**

- Adapter boundaries are respected.
- Windows behavior remains intact.

**Validation commands**

- `cd packages && npm run typecheck`
- `cd packages && npm run test`

## Backward compatibility

- Windows behavior must stay compatible.
- Public CLI surface should not change without a very strong reason.
- Any package script updates should preserve developer workflow.

## Risks / open questions

- OS conditionals may be more deeply scattered than expected.
- Some adapter responsibilities may need another iteration later in Phase 6.
- Cross-platform script cleanup can accidentally change Windows dev behavior.
