# Cross-Platform Host Parity Plan

## Goal

Raise `cppx` from a Windows-first tool into a product that delivers the same practical host-tooling experience on officially supported macOS and Linux hosts.

For this plan, "same level" means:

- users can bootstrap a supported host from the GUI or CLI without hand-writing build files
- users can detect, install, repair/update, and remove supported tools through `cppx`
- users get comparable `status`, `doctor`, `init`, `build`, `run`, `test`, and `pack` workflows on each supported host
- backend choice (`vcpkg`, `conan`, `none`) and preset management behave consistently across hosts
- CI validates the clean-host path on every officially supported host family

## Why this plan exists

The current product already provides a shared workflow surface, but host-tooling parity is still uneven:

- Windows has the richest managed-tool experience today
- macOS and Linux mostly rely on preinstalled system tools
- `conan` is still not managed as a first-class tool lifecycle on any host
- tool removal is not yet a first-class product action
- Linux support is functionally present but not narrowed to an explicit supported distro matrix

The result is that the app feels cross-platform at the workflow layer, but not yet at the host-setup layer.

## Supported-host target for this plan

This plan does not attempt "all Unix-like systems."
It defines parity for an explicit host matrix first:

- Windows 11 x64
- macOS 14+ on Apple Silicon and Intel, using Homebrew as the managed host package provider
- Ubuntu 24.04 x64, using `apt` as the managed host package provider

Everything outside that matrix remains best-effort `system` mode unless a later plan expands support.

## Non-goals

- No renderer redesign or visual overhaul.
- No multi-workspace redesign.
- No arbitrary Linux distro parity in this plan.
- No package-registry browsing UX.
- No signed installer / notarization pipeline.
- No auto-update system.
- No replacement of CMake with another build backend.
- No hidden destructive uninstall of tools that `cppx` did not install.

## Product rules for parity

- Windows behavior must remain at least as capable as today.
- macOS/Linux parity should match user experience, not necessarily identical implementation.
- `remove` actions must be ownership-aware:
  - tools installed by `cppx` may be removed by `cppx`
  - preexisting host tools must be reported, but not silently uninstalled
- Tool policy must stay explicit:
  - `managed`
  - `system`
- Unsupported hosts or unsupported provider combinations must fail clearly and conservatively.

## Milestones

### M1 - Host parity contract and tool lifecycle model

Scope

- Define the official support matrix in code and docs.
- Introduce a host package/provider abstraction for tool lifecycle actions:
  - detect
  - install
  - repair/update
  - remove
- Distinguish `cppx-owned` tools from preexisting host tools in status records.
- Normalize user-facing compiler labels so macOS/Linux no longer leak Windows-oriented naming.
- Extend shared contracts so CLI and GUI can reason about per-tool capabilities on the current host.
- Define explicit ownership and safety rules for uninstall behavior.

Acceptance criteria

- The product can tell the user, per tool, whether install/update/remove is supported on the current host.
- `status` and `doctor` can distinguish:
  - ready vs missing
  - system vs managed
  - cppx-owned vs externally owned
- The support matrix is documented and enforced rather than implied.

Validation commands

- `cd packages && npm run typecheck`
- `cd packages && npm run test`
- add focused tests for capability/ownership/status modeling

### M2 - macOS managed host parity

Scope

- Add a Homebrew-backed managed provider for supported macOS hosts.
- Support managed lifecycle for core tools on macOS:
  - `cmake`
  - `ninja`
  - C++ compiler toolchain policy (`clang` / native toolchain)
  - `conan`
- Add managed `vcpkg` install/update/remove for macOS using verified archive/bootstrap flow.
- Improve `doctor` and first-run guidance for clean macOS hosts.
- Ensure `init`, `install-tools`, `status`, and removal flows behave coherently from the GUI and CLI.

Acceptance criteria

- A supported macOS host can be bootstrapped from a near-clean state using `cppx`.
- `status` and `doctor` explain whether a tool came from Homebrew, archive install, or the system.
- `remove` does not uninstall tools that were already present before `cppx` took ownership.

Validation commands

- `cd packages && npm run typecheck`
- `cd packages && npm run test`
- `cd packages && npm run smoke:ci`
- GitHub Actions validation on `macos-latest`

### M3 - Linux managed host parity

Scope

- Add an `apt`-backed managed provider for Ubuntu 24.04.
- Support managed lifecycle for core tools on the supported Linux target:
  - `cmake`
  - `ninja`
  - `g++` and/or `clang++`
  - `conan`
- Add managed `vcpkg` install/update/remove for the supported Linux target using verified archive/bootstrap flow.
- Add distro detection and clear fallback rules:
  - supported Ubuntu path -> managed lifecycle available
  - unsupported distro path -> explicit `system` fallback with clear messaging
- Keep the tool policy/config model shared with Windows and macOS.

Acceptance criteria

- A supported Ubuntu host can be bootstrapped from a near-clean state using `cppx`.
- Unsupported Linux distros fail clearly instead of pretending to support managed mode.
- Linux status/doctor output is capability-aware and ownership-aware.

Validation commands

- `cd packages && npm run typecheck`
- `cd packages && npm run test`
- `cd packages && npm run smoke:ci`
- GitHub Actions validation on `ubuntu-latest`

### M4 - Cross-platform CLI/GUI parity for tool management

Scope

- Add first-class CLI actions for lifecycle operations beyond install:
  - install
  - update/repair
  - remove
- Surface the same actions in the GUI where the current host supports them.
- Show per-tool capability and ownership state in the GUI.
- Make the first-run path coherent from the GUI:
  - detect host defaults
  - explain backend consequences
  - offer the supported next action for missing tools
- Keep project-generation and preset flows aligned with the new tool lifecycle model.

Acceptance criteria

- Users no longer need to drop to the host package manager for the common supported-host setup/removal path.
- CLI and GUI expose the same practical lifecycle choices on supported hosts.
- Unsupported actions are hidden or clearly disabled with explanation.

Validation commands

- `cd packages && npm run typecheck`
- `cd packages && npm run test`
- add focused tests for new CLI command semantics and GUI-facing contract payloads

### M5 - CI, docs, and release readiness for parity

Scope

- Expand CI so parity claims are backed by supported-host validation.
- Add or strengthen clean-host bootstrap checks for:
  - Windows
  - macOS
  - Ubuntu
- Update docs to describe:
  - official support matrix
  - ownership-aware remove behavior
  - provider model (`archive`, Homebrew, `apt`, system)
  - backend/tool-policy recommendations by host
- Ensure release automation and docs no longer imply unsupported host parity beyond the declared matrix.

Acceptance criteria

- Every parity claim in docs maps to an actual supported host/provider path.
- CI covers the official parity matrix.
- Release/docs wording matches the real supported experience.

Validation commands

- `cd packages && npm run typecheck`
- `cd packages && npm run test`
- `cd packages && npm run test:ci`
- `cd packages && npm run smoke:ci`
- review GitHub Actions workflow coverage against the declared support matrix

## Backward compatibility

- Preserve the meaning of existing workflow commands:
  - `init`
  - `add`
  - `build`
  - `run`
  - `test`
  - `pack`
  - `status`
  - `doctor`
- Keep existing Windows defaults unless the new lifecycle model explicitly upgrades them.
- Treat new remove/update behavior as additive.
- Keep current config files readable; new capability or ownership fields should be additive and migratable.

## Risks / open questions

- Homebrew and `apt` lifecycle actions can require elevated privileges or interactive prompts.
- Linux distro fragmentation makes "Linux parity" meaningless unless support remains explicit and narrow.
- `conan` lifecycle support introduces Python/runtime considerations that differ by host.
- Ownership-aware remove behavior is easy to get wrong if the install record model is weak.
- Compiler-family UX may need a public model richer than the current internal `mingw` / `msvc` split.

## Exit criteria

This plan is complete when:

- official macOS and Linux targets have a real managed host-tool path, not just `system` fallback
- install/update/remove flows are ownership-aware and available from both CLI and GUI where supported
- `vcpkg` and `conan` no longer feel Windows-only in product experience
- docs and CI describe and validate a concrete cross-platform parity matrix
