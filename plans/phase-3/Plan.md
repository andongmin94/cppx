# Phase 3 Plan — tool catalog and version/install policy

## Goal

Remove hardcoded tool-version assumptions from core logic and introduce tool catalog plus install policy concepts.

## Non-goals

- No dependency backend abstraction yet.
- No preset matrix rewrite.
- No macOS/Linux native support activation.
- No large renderer work.

## Milestones

### M1 — Define catalog and policy model

**Scope**

- Introduce `ToolInstallMode` and `ToolVersionPolicy` concepts.
- Design catalog storage for OS/arch tool metadata.
- Define manifest metadata extensions.

**Expected files**

- tool policy/type files
- catalog module or data files
- tests

**Acceptance criteria**

- There is a clear distinction between policy and installer execution.
- Default Windows behavior is representable with the new model.

**Validation commands**

- `cd packages && npm run typecheck`
- `cd packages && npm run test`

### M2 — Move hardcoded tool sources into catalog-driven resolution

**Scope**

- Externalize CMake/Ninja metadata.
- Keep current defaults while removing business-logic hardcoding.
- Add hooks for system-tool discovery.

**Expected files**

- `packages/src/main/cppx/installers.ts`
- new catalog files
- manifest-related files
- tests

**Acceptance criteria**

- Core logic no longer embeds the CMake/Ninja versions directly.
- System vs managed tool resolution is modeled cleanly.

**Validation commands**

- `cd packages && npm run typecheck`
- `cd packages && npm run test`

### M3 — Expose policy choices through status/install flows

**Scope**

- Extend manifest/status output to describe source, version, platform, arch, and install mode.
- Add minimal CLI option wiring if appropriate.
- Document any new defaults or options.

**Expected files**

- CLI/service/status-related files
- manifest files
- docs/tests

**Acceptance criteria**

- Users can distinguish managed vs system tools.
- New metadata is observable and validated.

**Validation commands**

- `cd packages && npm run typecheck`
- `cd packages && npm run test`

## Backward compatibility

- Current Windows default behavior must still work.
- Previously installed managed tools should remain discoverable or be migrated safely.
- User-facing install errors should stay as good or better.

## Risks / open questions

- Installer assumptions may be spread across more code than expected.
- System-tool detection can become platform-specific later and should stay abstracted.
- Manifest migration may need careful handling.
