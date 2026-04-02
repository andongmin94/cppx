# cppx

`cppx` is a cross-platform C++ toolchain and workflow manager.

The repository is being standardized around one core contract:

- one product across Windows, macOS, and Linux
- one consistent CLI/GUI decision surface
- backend choice, compiler choice, tool mode, provider, ownership, lifecycle capability, status, and doctor guidance must line up across official hosts

## Product direction

The official host slice for this repository direction is:

- Windows x64
- macOS 14+ (`x64`, `arm64`)
- Ubuntu LTS profiles (22.04, 24.04) (`x64`, `arm64`)

Other Linux distributions remain best-effort and system-oriented until they are explicitly promoted.

## What `cppx` is expected to manage

`cppx` is expected to orchestrate:

- dependency backend selection: `vcpkg | conan | none`
- compiler strategy selection
- host tool preparation or detection
- exact pinned versions for official-host managed non-compiler tools
- project generation and generated build integration artifacts
- the full `init -> add -> build -> run -> test -> pack` workflow
- `status` and `doctor` guidance

## Repository documents

The root documents are intentionally minimal:

- `README.md` — public overview
- `CONTRIBUTING.md` — contributor workflow
- `LICENSE.md` — license text
- `AGENTS.md` — repository-wide AI execution rules
- `SPEC.md` — canonical product and implementation spec
- `TASK.md` — current execution batch

## Contributor workflow

Use the repository root as the default working directory.

Validation commands:

```bash
npm --prefix packages run typecheck
npm --prefix packages run test
npm --prefix packages run build
npm --prefix packages run smoke:ci
```

## Canonical implementation spec

The authoritative implementation contract lives in:

- `SPEC.md`
- `TASK.md`

`AGENTS.md` defines how AI agents must execute that contract.
