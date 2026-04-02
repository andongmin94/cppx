# Tool Installation

`cppx` uses a host-specific provider model for tool bootstrap.

- Windows x64: managed archives for core tools, plus system MSVC detection
- macOS 14+: Homebrew for core tools, verified archive/bootstrap for `vcpkg`
- Ubuntu LTS profiles (22.04, 24.04): `apt` for core tools and the managed Clang/GCC compiler path, verified archive/bootstrap for `vcpkg`, and `pipx` for `conan`
- Other Linux distributions: conservative `system` detection only

Pinned exact versions are supported for official-host managed non-compiler tools.

- Windows: exact versions use verified archives/releases
- macOS 14+: exact pins for `cmake`, `ninja`, and `conan` use verified archives/releases
- Ubuntu LTS profiles (22.04, 24.04): exact pins for `cmake` and `ninja` use verified archives, and `conan` uses `pipx`
- `vcpkg` exact versions remain catalog-curated across official hosts
- non-Windows managed `cxx` stays on floating defaults for now, but official macOS/Ubuntu hosts expose both managed and system compiler paths

## Basic command

```bash
npm --prefix packages run cppx -- install-tools
```

## Support matrix

| Host | Default backend | CMake / Ninja | vcpkg | conan | C++ compiler |
|---|---|---|---|---|---|
| Windows x64 | `none` | `managed` | `managed` | `managed` | `managed` (MinGW) or `system` (MSVC) |
| macOS 14+ | `none` | `managed` | `managed` | `managed` | `managed` (Homebrew LLVM) or `system` (Apple Clang / `clang++`) |
| Ubuntu LTS profiles (22.04, 24.04) | `none` | `managed` | `managed` | `managed` (`pipx`) | `managed` (`Clang` or `GCC` via `apt`) or `system` (PATH `clang++` / `g++`) |
| Other Linux | `none` | `system` | `system` | `system` | `system` |

## Provider behavior

### Windows

- `cppx` downloads verified archives for `cmake`, `ninja`, `vcpkg`, `conan`, and the managed MinGW toolchain.
- MSVC remains a detected system toolchain.
- Conan uses the official Windows release zip with checksum verification.

### macOS 14+

- `cppx install-tools` uses Homebrew for `cmake`, `ninja`, `conan`, and `llvm`.
- `vcpkg` uses the verified archive/bootstrap path.
- pinned exact versions for `cmake`, `ninja`, and `conan` switch to verified archive/release assets.
- `tools.cxx.mode = "system"` keeps using the compiler already visible on `PATH`.
- Homebrew must already be installed.

### Ubuntu LTS profiles (22.04, 24.04)

- `cppx install-tools` uses `apt` for:
  - `cmake`
  - `ninja-build`
  - `clang` or `g++` for the managed compiler, depending on `preferred_family`
- `vcpkg` uses the verified archive/bootstrap path.
- `conan` uses `pipx` in a `cppx`-owned isolated location.
- pinned exact versions for `cmake` and `ninja` switch to verified archives instead of `apt`.
- `tools.cxx.mode = "managed"` uses `clang` or `g++` from `apt`, depending on `preferred_family`.
- `tools.cxx.mode = "system"` uses the selected compiler from `PATH` (`clang++` or `g++`).
- `cppx` bootstraps `pipx` with `apt` when the host does not already provide it.
- `apt` operations may require root or passwordless `sudo`.

### Unsupported Linux distributions

- `cppx` does not claim managed Linux parity outside Ubuntu LTS profiles (22.04, 24.04).
- `install-tools` falls back to system detection instead of pretending managed support exists.

## Tool policy

Each tool is resolved in either `managed` or `system` mode.

- `managed`
  - Windows: archive installs
  - macOS: Homebrew or archive/bootstrap
  - Ubuntu LTS profiles (22.04, 24.04): `apt`, archive/bootstrap, or `pipx`
- `system`
  - Use what is already available on `PATH`
  - macOS official hosts can keep Apple Clang in `system` mode
  - Ubuntu LTS official hosts can choose `clang` or `gcc` in managed mode, or keep `clang++` / `g++` in system mode
  - `status` and `doctor` still report provider and ownership metadata when possible

`status` and `doctor` report:

- `mode`
- `provider`
- `ownership`
- `requestedVersion`
- `resolvedVersion`
- `verifiedSha256`

On Ubuntu LTS profiles (22.04, 24.04), provider ownership is split by tool:

- `apt` for `cmake`, `ninja`, and the selected managed compiler (`clang++` or `g++`)
- archive/bootstrap for `vcpkg`
- `pipx` for `conan`

## Examples

### Windows with managed MinGW

```bash
npm --prefix packages run cppx -- install-tools --compiler mingw
```

### Windows with system MSVC

```bash
npm --prefix packages run cppx -- install-tools --compiler msvc --msvc-installation-path "C:\Program Files\Microsoft Visual Studio\2022\BuildTools"
```

### macOS 14+ managed host bootstrap

```bash
npm --prefix packages run cppx -- install-tools
```

### Ubuntu LTS managed host bootstrap

```bash
npm --prefix packages run cppx -- install-tools
```

### Ubuntu LTS managed GCC bootstrap

```bash
npm --prefix packages run cppx -- install-tools --compiler gcc
```

### Unsupported Linux system detection

```bash
npm --prefix packages run cppx -- install-tools
```

## Validation

```bash
npm --prefix packages run test
npm --prefix packages run smoke:native
```

`smoke:native` verifies the current host can complete the `init -> build -> run -> test -> pack` flow.
