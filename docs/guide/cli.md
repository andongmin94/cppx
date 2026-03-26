# CLI Guide

`cppx` CLI drives a C++ project through the `init -> add -> build -> run -> test -> pack` workflow.

## Usage

```bash
npm --prefix packages run cppx -- <command> [options]
```

## Commands

### `install-tools`

Prepare host tools for the active platform.

```bash
npm --prefix packages run cppx -- install-tools
npm --prefix packages run cppx -- install-tools --compiler clang
npm --prefix packages run cppx -- install-tools --compiler mingw
npm --prefix packages run cppx -- install-tools --compiler msvc --msvc-installation-path "C:\Program Files\Microsoft Visual Studio\2022\BuildTools"
```

Options:

| Option | Meaning |
|---|---|
| `--compiler <clang|mingw|msvc>` | Choose the compiler model for the active host |
| `--msvc-installation-path <path>` | Prefer a specific MSVC installation |

Provider summary:

- Windows: verified archive installs for `cmake`, `ninja`, `vcpkg`, `conan`, and the managed MinGW toolchain, plus system MSVC detection
- macOS 14+: Homebrew for core tools and archive/bootstrap for `vcpkg`
- Ubuntu 24.04: `apt` for `cmake`, `ninja`, `clang++`, archive/bootstrap for `vcpkg`, and `pipx` for `conan`
- Other Linux: system detection only

Linux note:

- Ubuntu 24.04 is the only official Linux managed host in this slice.
- Unsupported Linux distributions still stay system-only.

### `init [workspace]`

Create a new project.

```bash
npm --prefix packages run cppx -- init ./myapp --name myapp
npm --prefix packages run cppx -- init ./myapp --name myapp --backend conan
```

Options:

| Option | Meaning |
|---|---|
| `-n, --name <name>` | Project name |
| `--backend <vcpkg|conan|none>` | Initial dependency backend |

### `add <dependency> [workspace]`

Add a dependency to `.cppx/config.toml`.

```bash
npm --prefix packages run cppx -- add fmt ./myapp
```

- `vcpkg`: written into `build/.cppx/vcpkg.json` on the next sync
- `conan`: written into `build/.cppx/conanfile.txt` on the next sync
- `none`: rejected

### `build [workspace]`

Run configure + build for the selected preset.

```bash
npm --prefix packages run cppx -- build ./myapp
npm --prefix packages run cppx -- build ./myapp --preset release-x64
```

### `run [workspace]`

Build first, then run the preset binary.

```bash
npm --prefix packages run cppx -- run ./myapp
```

### `test [workspace]`

Run the CTest preset.

```bash
npm --prefix packages run cppx -- test ./myapp
```

### `pack [workspace]`

Run the CPack preset.

```bash
npm --prefix packages run cppx -- pack ./myapp
```

### `status [workspace]`

Inspect tool readiness and provenance.

```bash
npm --prefix packages run cppx -- status
npm --prefix packages run cppx -- status ./myapp
```

The output shows:

- `managed` vs `system`
- provider (`archive`, `homebrew`, `apt`, `pipx`, `system`, `msvc`)
- ownership (`cppx-owned` vs `external`)
- requested / resolved version
- executable path

### `doctor [workspace]`

Show blockers, warnings, and next steps for the current host and workspace.

```bash
npm --prefix packages run cppx -- doctor
npm --prefix packages run cppx -- doctor ./myapp
```

`doctor` checks:

- host support tier and provider path
- `cmake`, `ninja`, `ctest`, `cpack`, `cxx`
- `vcpkg` or `conan` when the active backend requires them
- `.cppx/config.toml` and generated `build/.cppx` files

The command exits with code `1` when blockers remain.

## Backend behavior

- `vcpkg`: generates `build/.cppx/vcpkg.json` and uses `vcpkg.cmake`
- `conan`: generates `build/.cppx/conanfile.txt` and runs `conan install` before configure
- `none`: no dependency manifest and `cppx add` is disabled

## Presets

- `[[presets]]` defines the configure/build/test/pack matrix
- `runnable = false` excludes a preset from `run`
- when no presets exist, `cppx` creates `debug-<host-arch>` and `release-<host-arch>`
