# Batch D Plan - Phase 6

## Goal

Enable native host workflows on Windows, macOS, and Linux.
This batch is about host-native build, run, test, and pack support on the current machine, not full foreign-target cross-compilation.

This batch builds on the Batch C baseline where:

- `cd packages && npm run typecheck`
- `cd packages && npm run test`

are the repo-standard validations.

## Non-goals

- No universal binary, notarization, or signing polish.
- No remote toolchain or SDK management.
- No renderer-first work.
- No promise of full cross-compilation parity across hosts.

## Milestones

### M1 - Darwin/Linux adapters and host-native defaults

**Scope**
- Replace conservative darwin/linux placeholder adapters with real host adapters.
- Generalize host roots, executable naming, shell commands, archive extraction, bootstrap commands, and default backend/triplet assumptions through the adapter layer.
- Keep Windows behavior intact.

**Acceptance criteria**
- `createHostAdapter()` can describe Windows, macOS, and Linux concretely.
- Core path and naming logic no longer depends on the unsupported placeholder on non-Windows hosts.
- Non-Windows defaults are explicit rather than inheriting Windows assumptions.

**Validation commands**
- `cd packages && npm run typecheck`
- `cd packages && npm run test`

### M2 - Native tool discovery and runtime flow on macOS/Linux

**Scope**
- Make system tool discovery host-aware.
- Default non-Windows flows to native system tools instead of Windows-style managed assumptions.
- Ensure `init`, `build`, `run`, `test`, and `pack` avoid `.exe` and `where` assumptions on non-Windows hosts.

**Acceptance criteria**
- Native host flows on macOS/Linux can resolve `cmake`, `ninja`, and a system C++ compiler.
- Non-Windows defaults do not require `vcpkg` unless the active backend is actually `vcpkg`.
- Windows behavior remains backward compatible.

**Validation commands**
- `cd packages && npm run typecheck`
- `cd packages && npm run test`

### M3 - Multi-OS CI and smoke coverage

**Scope**
- Add Windows, macOS, and Ubuntu validation jobs.
- Add a small no-dependency smoke flow that validates native `init -> build -> run -> test`.
- Update docs to describe native host support honestly, including remaining limits.

**Acceptance criteria**
- CI workflow includes `windows-latest`, `macos-latest`, and `ubuntu-latest`.
- Smoke validation uses the host-native toolchain path rather than Windows-only assumptions.
- Documentation clearly states what is supported and what still requires manual setup.

**Validation commands**
- review CI workflow YAML for 3-host coverage
- `cd packages && npm run typecheck`
- `cd packages && npm run test`

## Backward compatibility

- Existing Windows behavior must remain intact.
- Existing Windows projects using vcpkg/default presets must continue to work.
- New non-Windows support should fail clearly when a required system tool is missing instead of pretending to work.

## Risks / open questions

- Current tests and fixtures are heavily Windows-shaped, so host-aware test scoping is part of the batch.
- Managed tool catalogs are still Windows-only, so native non-Windows support should default to system tools for now.
- Conan itself is still an external prerequisite when selected as the backend.
