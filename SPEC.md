# SPEC

This file is the canonical human-authored specification for the current `cppx` direction.

## 1. Product definition

`cppx` is a **cross-platform C++ toolchain and workflow manager**.
It must feel like one product across Windows, macOS, and Linux rather than three unrelated host-specific paths.

`cppx` is not just a project generator. It is responsible for:

- preparing or detecting host tools
- letting the user choose a dependency backend
- letting the user choose a compiler strategy
- generating project-owned build integration artifacts
- driving `init -> add -> build -> run -> test -> pack`
- explaining status, provenance, ownership, lifecycle capability, and blockers

## 2. Main design principle

The most important principle is:

> OS-specific implementation may differ, but the user-visible decision surface must be consistent.

That means every official host must expose the same conceptual controls in both CLI and GUI.

Required user-visible concepts:

- dependency backend: `vcpkg | conan | none`
- compiler choice
- tool mode: `managed | system`
- provider/provenance
- ownership
- lifecycle capability: `detect | install | repair | remove`
- status readiness and doctor guidance

The names and meanings of these concepts must match in:

- config/schema
- CLI help and behavior
- GUI controls and labels
- `status`
- `doctor`
- README and guide docs
- tests/contract checks

## 3. Official host policy

### 3.1 Official hosts

The official hosts for this product slice are:

- Windows x64
- macOS 14+ (`x64` and `arm64`)
- Ubuntu 24.04 (`x64` and `arm64`)

### 3.2 Best-effort hosts

All other Linux distributions remain best-effort and system-oriented until they are explicitly promoted.

They may keep conservative `system` detection behavior, but docs and UX must clearly say that they are not part of the official managed slice.

## 4. Cross-platform parity contract

### 4.1 Backends

On every **official** host, the product must support the same backend choices:

- `vcpkg`
- `conan`
- `none`

These choices must be available in both CLI and GUI.

`conan` must be a first-class backend on official hosts. It must not be treated as a Windows-only or Linux-only afterthought, and it must not remain detect-only on Windows if the product claims toolchain management.

### 4.2 Compiler model

The compiler model must be host-neutral in structure even if the concrete options differ by host.

At minimum, the product must represent:

- compiler family/preference
- tool mode (`managed` or `system`)
- provider/provenance

The current Windows-only framing of compiler selection is not acceptable as the long-term contract.

The model must support host-valid choices such as:

- Windows: `mingw` managed, `msvc` system
- macOS: `clang` system (Apple toolchain), `clang` managed (Homebrew LLVM)
- Ubuntu 24.04: `clang` managed at minimum, with optional `gcc` system support if implemented in the same model

A compiler value that is semantically wrong for the current host must not be used as the visible default. In particular, non-Windows hosts must not default to a `mingw` family label.

### 4.3 Tool lifecycle parity

For every official host, the user must be able to understand, through the same CLI/GUI concepts:

- whether a tool is ready or missing
- whether it is managed or external/system
- which provider supplied it
- whether it is cppx-owned or external
- whether `install`, `repair`, and `remove` are actually available on that host

The GUI must not ship with a stale fallback matrix that contradicts the real platform contract.

## 5. Single source of truth for host capability

Host support and tool lifecycle capability must be defined in one canonical code path or shared contract.

This shared contract must drive or inform:

- CLI behavior and help text
- GUI controls and labels
- `status`
- `doctor`
- tests
- support tables in docs

No separate hard-coded truth tables are allowed to drift independently.

## 6. Official host expectations

### 6.1 Windows x64

Required product behavior:

- backend choice includes `vcpkg`, `conan`, `none`
- compiler choice includes MinGW and MSVC paths
- `install-tools` must be able to prepare official managed tools from the product surface
- Conan must be treated as a first-class official-host tool, not PATH-only detection if parity is being claimed
- CLI and GUI must describe the Windows compiler choices using the same terms

### 6.2 macOS 14+

Required product behavior:

- backend choice includes `vcpkg`, `conan`, `none`
- managed path uses the Homebrew/archive model where appropriate
- GUI and CLI must not imply that managed lifecycle is unsupported if the product uses Homebrew/archive as the official path
- compiler selection must use a macOS-appropriate representation instead of a Windows-oriented label

### 6.3 Ubuntu 24.04

Required product behavior:

- Ubuntu 24.04 is the official Linux managed slice
- backend choice includes `vcpkg`, `conan`, `none`
- managed path may use `apt`, archive/bootstrap, and `pipx`
- CLI, GUI, docs, and tests must agree that Ubuntu 24.04 is the managed Linux slice
- other Linux distributions must remain clearly marked as best-effort system-only

## 7. CLI and GUI parity requirements

CLI and GUI must present the same decision surface.

That means:

- same backend names
- same compiler labels and valid options per host
- same meaning of `managed` vs `system`
- same support-level wording for each host
- same status/doctor framing for blockers and next steps

A user should not learn one support policy from the CLI and a different one from the GUI.

## 8. Documentation contract

Repository docs must reflect the same product contract.

Required root docs:

- `README.md` — public overview and support summary
- `CONTRIBUTING.md` — contributor workflow and repo rules
- `AGENTS.md` — repository-wide AI execution rules
- `SPEC.md` — this canonical product spec
- `TASK.md` — current execution batch
- `LICENSE.md` — license text

Docs under `docs/` must agree with root docs.

The repository should use a root-first contributor workflow. If root command entrypoints do not exist yet, they should be added as part of the implementation work.

## 9. Required implementation themes

The current implementation work should prioritize the following:

1. unify AI instruction entrypoints at the root
2. introduce a single source of truth for host capability and lifecycle support
3. make Windows, macOS, and Ubuntu 24.04 expose one consistent CLI/GUI toolchain model
4. remove Windows-only wording from compiler selection contracts
5. make official-host Conan support product-level and explicit
6. rewrite docs so README, install guide, CLI guide, GUI language, and support tables all agree
7. add tests or contract checks that fail when host capability claims drift
8. add root-first developer entrypoints so contributors and agents can operate from repo root

## 10. Explicit non-goals for this batch

The following are important but out of scope for this batch unless directly needed by the parity work:

- signed installers
- notarization
- auto-update
- broad support for all Linux distributions
- large template/workspace expansion
- unrelated refactors outside the toolchain-parity and instruction-system work

## 11. Acceptance criteria

This spec is satisfied only when all of the following are true:

1. CLI and GUI expose the same backend choices and host-appropriate compiler choices on official hosts.
2. Windows, macOS, and Ubuntu 24.04 no longer present contradictory tool-lifecycle/support claims.
3. Ubuntu 24.04 is consistently documented and implemented as the official managed Linux slice.
4. Windows Conan is no longer represented as a second-class detect-only path if Windows remains an official tool-management host.
5. Non-Windows hosts no longer surface `mingw` as the visible default compiler family.
6. README, install docs, CLI docs, and runtime UI all describe the same support matrix.
7. Root AI instructions are reduced to the root `AGENTS.md`, `SPEC.md`, and `TASK.md` model.
8. Validation and contract tests exist for the support matrix so future drift is easier to catch.
