# Phase M3B Plan - Ubuntu 24.04 managed conan parity

## Goal

Finish the remaining Linux parity gap inside root `Plan.md` milestone `M3` by adding a managed `conan` path for Ubuntu 24.04.

This slice keeps the M3A Ubuntu model:

- `cmake`, `ninja`, `cxx` via `apt`
- `vcpkg` via archive/bootstrap

and adds:

- `conan` via `pipx`, bootstrapped from Ubuntu system packages when necessary

## Non-goals

- No new CLI verbs or GUI lifecycle actions. That remains in root `M4`.
- No support claim for arbitrary Linux distributions beyond Ubuntu 24.04.
- No switch away from Homebrew on macOS or archive providers on Windows.
- No attempt to manage generic Python tooling beyond what is required to run Conan.

## Why this slice exists

Official Conan 2 installation guidance says:

- `pip` is the preferred installation path in general
- on modern Linux distributions with externally managed Python, `pipx` is recommended
- for Debian-based distributions, `pipx` can be installed with `apt-get install pipx`

That makes `pipx` the safest managed provider for Ubuntu 24.04 because it avoids mutating the system Python environment while still allowing `cppx` to bootstrap Conan on a clean host.

## Milestones

### M1 - Linux conan provider model

Scope

- Add `pipx` as a first-class lifecycle provider and managed source kind.
- Advertise Ubuntu 24.04 `conan` capability as `pipx`-managed instead of system-only.
- Change supported Ubuntu default tool policy for `conan` from `system` to `managed`.

Acceptance criteria

- Host defaults and lifecycle payloads report `conan` provider `pipx` on official Ubuntu 24.04 hosts.
- Other Linux distributions remain conservative `system` fallback.

Validation commands

- `cd packages && npm run typecheck`
- `cd packages && npm run test -- --test-name-pattern "host support|platform host adapter|service host defaults"`

### M2 - Managed Conan install and detection

Scope

- Install `pipx` through `apt` when required on supported Ubuntu 24.04 hosts.
- Install `conan` with `pipx` into a `cppx`-owned isolated location under the tool root.
- Detect `cppx`-owned managed Conan records and surface provider/ownership metadata correctly.
- Include the managed conan binary location in build env/path resolution.

Acceptance criteria

- `install-tools` can bootstrap managed Conan on supported Ubuntu 24.04.
- `status`, `doctor`, and tool resolution report `pipx` provenance for managed Conan.
- Existing system-only Conan workflows continue to work when explicitly configured.

Validation commands

- `cd packages && npm run typecheck`
- `cd packages && npm run test -- --test-name-pattern "conan|status|doctor|toolchain"`

### M3 - Docs and CI alignment

Scope

- Update CLI/install docs so Ubuntu 24.04 Linux parity includes managed Conan via `pipx`.
- Add Linux managed conan smoke coverage to CI.
- Keep wording aligned with official Ubuntu 24.04 support only.

Acceptance criteria

- Docs and CI match the actual Linux provider split:
  - apt for core tools
  - archive/bootstrap for vcpkg
  - pipx for conan

Validation commands

- `cd packages && npm run typecheck`
- `cd packages && npm run test`
- review `.github/workflows/native-ci.yml`

## Backward compatibility

- Windows and macOS behavior remain unchanged.
- Existing Linux `system` Conan workflows stay valid when `tools.conan.mode = "system"`.
- Unsupported Linux distributions remain system-only.

## Known risks / open questions

- `pipx` may not be on `PATH` immediately after installation, so the implementation should not rely on shell profile mutation.
- `pipx` creates virtual environments; the chosen `cppx`-owned location must stay deterministic for status and safe removal later.
- Conan exact-version semantics through `pipx` need to stay conservative unless explicitly verified.
