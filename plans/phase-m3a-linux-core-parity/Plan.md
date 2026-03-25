# Phase M3A Plan - Ubuntu 24.04 core managed parity

## Goal

Execute the first implementation slice of root `Plan.md` milestone `M3 - Linux managed host parity`.

This slice makes Ubuntu 24.04 x64/arm64 an explicit official managed host for:

- `cmake`
- `ninja`
- `cxx` via `clang++`
- `vcpkg` via archive/bootstrap

It also makes unsupported Linux distributions fail clearly back to `system` mode instead of silently inheriting Windows/macOS assumptions.

## Non-goals

- No CLI or GUI lifecycle surface expansion. That remains in root `M4`.
- No support claim for arbitrary Linux distributions beyond Ubuntu 24.04.
- No hidden uninstall/update behavior beyond what the current product already exposes.
- No Linux managed `conan` provider in this slice because Ubuntu 24.04 package-name verification showed no supported `conan` package path in the official package search.

## Milestones

### M1 - Official Ubuntu 24.04 host model

Scope

- Detect Ubuntu 24.04 explicitly in the Linux host model.
- Mark Ubuntu 24.04 as `official` with `apt` as the recommended provider when `apt-get` is available.
- Keep unsupported Linux hosts in explicit `system` fallback mode.
- Change Linux default tool policy on supported Ubuntu hosts to:
  - `cmake`: `managed`
  - `ninja`: `managed`
  - `vcpkg`: `managed`
  - `cxx`: `managed`
  - `conan`: `system`

Acceptance criteria

- Host defaults distinguish supported Ubuntu 24.04 from unsupported Linux distributions.
- Tool capabilities advertise `apt` for Ubuntu-managed core tools and `archive` for `vcpkg`.
- Default Linux tool policy no longer reports all tools as `system` on supported Ubuntu 24.04.

Validation commands

- `cd packages && npm run typecheck`
- `cd packages && npm run test -- --test-name-pattern "host support|platform host adapter|service host defaults"`

### M2 - Linux managed install and resolution flow

Scope

- Add `apt` managed install resolution for `cmake`, `ninja`, and `cxx` on supported Ubuntu 24.04.
- Reuse the existing archive/bootstrap flow for Linux `vcpkg`.
- Detect `apt`-provided executables as provider `apt` with ownership derived from manifest records.
- Keep Linux `conan` as explicit `system` fallback with clear messaging.

Acceptance criteria

- `install-tools` can use `apt` for Ubuntu 24.04 managed core tools.
- `status` / `doctor` / tool resolution can report `apt` provenance and ownership for Linux host tools.
- Linux `vcpkg` catalog resolution works on supported Ubuntu hosts.

Validation commands

- `cd packages && npm run typecheck`
- `cd packages && npm run test -- --test-name-pattern "toolchain|status|doctor|vcpkg"`

### M3 - Docs and CI alignment for the M3A slice

Scope

- Update CLI/install docs to describe Ubuntu 24.04 as the official Linux managed host.
- Document the conservative `conan` fallback.
- Add Linux managed smoke coverage and pin Linux CI to `ubuntu-24.04`.

Acceptance criteria

- Docs describe the same Linux support boundary the code enforces.
- CI validates both Linux system and Linux managed smoke paths on Ubuntu 24.04.

Validation commands

- `cd packages && npm run typecheck`
- `cd packages && npm run test`
- review `.github/workflows/native-ci.yml`

## Backward compatibility

- Windows behavior remains unchanged.
- macOS Homebrew behavior remains unchanged.
- Existing Linux `system` workflows continue to work on unsupported distributions.
- Linux `conan` users continue to rely on preinstalled/system `conan` in this slice.

## Known risks / open questions

- `apt` operations can require root or passwordless `sudo`; this slice must fail clearly when elevation is unavailable.
- `clang` package naming is stable enough for Ubuntu 24.04, but exact installed compiler version is still host-package-manager defined.
- Managed ownership for `apt` tools is record-based because executables live in shared system paths.
