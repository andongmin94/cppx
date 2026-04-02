# Config Guide

`cppx` stores project settings in `.cppx/config.toml`.

The file controls:

- project identity and default preset
- dependency backend selection
- compiler preference and tool mode
- generated preset metadata
- package output metadata

Generated files under `build/.cppx/` and `.vscode/` are derived from this config.

## Example

```toml
# cppx configuration

[project]
schema_version = 3
name = "myapp"
target_name = "myapp"
default_preset = "debug-x64"
source_file = "src/main.cpp"
cxx_standard = 20
target_triplet = "x64-linux"
dependency_backend = "conan"

[package]
version = "0.1.0"
vendor = "myapp"
generators = ["ZIP"]
output_dir = "dist"

[compiler]
preferred_family = "clang"

[dependencies]
packages = ["fmt", "spdlog"]

[cmake]
compile_definitions = ["USE_SSL", "APP_VERSION=1"]
compile_options = ["-Wall", "-Wextra"]
include_directories = ["include"]
link_libraries = []

[tools.cmake]
mode = "managed"
version = "default"

[tools.ninja]
mode = "managed"
version = "default"

[tools.conan]
mode = "managed"
version = "default"

[tools.cxx]
mode = "managed"
version = "latest"
preferred_family = "clang"

[[presets]]
name = "debug-x64"
display_name = "Debug x64"
build_type = "Debug"
target_triplet = "x64-linux"
runnable = true
```

## Project

`[project]` defines the core workspace contract.

| Key | Meaning |
|---|---|
| `schema_version` | Current config schema version |
| `name` | Project name |
| `target_name` | Generated CMake target name |
| `default_preset` | Preset used when `--preset` is omitted |
| `source_file` | Main source path |
| `cxx_standard` | C++ language standard |
| `target_triplet` | Default triplet for generated presets |
| `dependency_backend` | `vcpkg`, `conan`, or `none` |

Default backend and compiler preference are host-aware:

- Windows x64: backend `none`, compiler `mingw` by default
- macOS 14+: backend `none`, compiler `clang` by default
- Ubuntu LTS profiles (22.04, 24.04): backend `none`, compiler `clang` by default
- Other Linux: backend `none`, compiler `clang` with conservative system defaults

## Compiler

`[compiler]` stores the visible compiler preference.

| Key | Meaning |
|---|---|
| `preferred_family` | `clang`, `gcc`, `mingw`, or `msvc` |
| `msvc_installation_path` | Optional preferred MSVC installation root |

Recommended host usage:

- Windows: `mingw` or `msvc`
- macOS: `clang` with `managed` (Homebrew LLVM) or `system` (Apple Clang / `clang++`)
- Ubuntu LTS profiles (22.04, 24.04): `clang` or `gcc` with `managed` (`apt`), or `system` (`clang++` / `g++` on PATH)

## Tools

Each `[tools.*]` section controls one tool policy.

Shared keys:

| Key | Meaning |
|---|---|
| `mode` | `managed` or `system` |
| `version` | `default`, `latest`, or a pinned version |

Pinned version behavior:

- `cmake`, `ninja`, `vcpkg`, and `conan` support managed exact pins on official hosts
- `vcpkg` exact versions are limited to catalog-listed releases
- macOS exact pins for `cmake`, `ninja`, and `conan` use archive/release providers instead of default Homebrew flows
- Ubuntu LTS profiles (22.04, 24.04) exact pins for `cmake` and `ninja` use archive providers, and `conan` exact pins use `pipx`
- non-Windows managed `cxx` currently stays on floating defaults
- Ubuntu LTS profiles (22.04, 24.04) can choose `preferred_family = "clang"` or `preferred_family = "gcc"` for managed `cxx`
- official macOS/Ubuntu hosts can still set `[tools.cxx].mode = "system"` explicitly

`[tools.cxx]` also accepts:

| Key | Meaning |
|---|---|
| `preferred_family` | Compiler preference for the host |
| `msvc_installation_path` | Optional MSVC override |

## Presets

`[[presets]]` drives generated CMake configure/build/test/pack presets.

| Key | Meaning |
|---|---|
| `name` | Stable preset id |
| `display_name` | UI label |
| `build_type` | CMake build type |
| `target_triplet` | Preset-specific triplet |
| `runnable` | Whether `cppx run` should expose the preset |

If no presets are defined, `cppx` creates `debug-<host-arch>` and `release-<host-arch>`.

## Backend Output

- `dependency_backend = "vcpkg"` generates `build/.cppx/vcpkg.json`
- `dependency_backend = "conan"` generates `build/.cppx/conanfile.txt`
- `dependency_backend = "none"` skips dependency manifest generation
