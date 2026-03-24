# Phase 6 Plan — macOS/Linux native host support

## Goal

Enable native host build/run/test/pack on Windows, macOS, and Linux without attempting full foreign-target cross-compilation.

## Non-goals

- No universal binary, notarization, or code-signing polish.
- No mobile, embedded, or remote toolchain support.
- No promise of full cross-compile run/test parity.

## Milestones

### M1 — Implement Darwin and Linux adapters

**Scope**

- Complete `darwin` and `linux` host adapters.
- Support host-aware app data roots, path separators, executable naming, and system command resolution.
- Keep Windows adapter untouched unless necessary.

**Expected files**

- platform adapter files
- path resolution files
- tests

**Acceptance criteria**

- The adapter layer can describe all three major desktop hosts.
- No new scattered platform conditionals are introduced unnecessarily.

**Validation commands**

- `cd packages && npm run typecheck`
- `cd packages && npm run test`

### M2 — Enable native compiler and tool discovery on macOS/Linux

**Scope**

- Implement host-aware compiler detection priorities.
- Prefer system compilers initially on macOS/Linux.
- Make run/test/pack and tool discovery host-aware.

**Expected files**

- `packages/src/main/cppx/installers.ts`
- `packages/src/main/cppx/project.ts`
- `packages/src/main/cppx/service.ts`
- tests

**Acceptance criteria**

- Host-native flows do not rely on `.exe` assumptions.
- ctest/cpack/tool discovery works in a host-aware manner.

**Validation commands**

- `cd packages && npm run typecheck`
- `cd packages && npm run test`

### M3 — Add multi-OS smoke validation

**Scope**

- Add CI matrix across Windows, macOS, and Ubuntu.
- Validate hello-world native build/run/test on each host.
- Be explicit about what remains unsupported.

**Expected files**

- `.github/workflows/...`
- sample/fixture projects
- docs

**Acceptance criteria**

- 3-host CI exists.
- At least a no-dependency sample validates native flows.
- Support scope is documented honestly.

**Validation commands**

- workflow review for windows-latest, macos-latest, ubuntu-latest
- `cd packages && npm run typecheck`
- `cd packages && npm run test`

## Backward compatibility

- Windows behavior must remain compatible.
- Success means native host support, not full cross-compilation parity.
- Unsupported scenarios must fail clearly rather than pretending to work.

## Risks / open questions

- Tool detection differs significantly across hosts.
- Packaging behavior may vary by host and may need future refinement.
- CI smoke coverage may expose assumptions in dependencies or docs.
