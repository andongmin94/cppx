# Tool Installation

`cppx` uses a host-specific provider model for tool bootstrap.

- Windows x64: managed archives for core tools, plus system MSVC detection
- macOS 14+: Homebrew for core tools, verified archive/bootstrap for `vcpkg`
- Ubuntu 24.04 x64/arm64: `apt` for core tools, verified archive/bootstrap for `vcpkg`, and `pipx` for `conan`
- Other Linux distributions: conservative `system` detection only

## Basic command

```bash
npm --prefix packages run cppx -- install-tools
```

## Support matrix

| Host | Default backend | CMake / Ninja | vcpkg | conan | C++ compiler |
|---|---|---|---|---|---|
| Windows x64 | `vcpkg` | `managed` | `managed` | `managed` | `managed` (MinGW) or `system` (MSVC) |
| macOS 14+ | `none` | `managed` | `managed` | `managed` | `managed` (Homebrew llvm) |
| Ubuntu 24.04 | `none` | `managed` | `managed` | `managed` (`pipx`) | `managed` (`clang++` via `apt`) |
| Other Linux | `none` | `system` | `system` | `system` | `system` |

## Provider behavior

### Windows

- `cppx` downloads verified archives for `cmake`, `ninja`, `vcpkg`, `conan`, and the managed MinGW toolchain.
- MSVC remains a detected system toolchain.
- Conan uses the official Windows release zip with checksum verification.

### macOS 14+

- `cppx install-tools` uses Homebrew for `cmake`, `ninja`, `conan`, and `llvm`.
- `vcpkg` uses the verified archive/bootstrap path.
- Homebrew must already be installed.

### Ubuntu 24.04

- `cppx install-tools` uses `apt` for:
  - `cmake`
  - `ninja-build`
  - `clang`
- `vcpkg` uses the verified archive/bootstrap path.
- `conan` uses `pipx` in a `cppx`-owned isolated location.
- `cppx` bootstraps `pipx` with `apt` when the host does not already provide it.
- `apt` operations may require root or passwordless `sudo`.

### Unsupported Linux distributions

- `cppx` does not claim managed Linux parity outside Ubuntu 24.04.
- `install-tools` falls back to system detection instead of pretending managed support exists.

## Tool policy

Each tool is resolved in either `managed` or `system` mode.

- `managed`
  - Windows: archive installs
  - macOS: Homebrew or archive/bootstrap
  - Ubuntu 24.04: `apt`, archive/bootstrap, or `pipx`
- `system`
  - Use what is already available on `PATH`
  - `status` and `doctor` still report provider and ownership metadata when possible

`status` and `doctor` report:

- `mode`
- `provider`
- `ownership`
- `requestedVersion`
- `resolvedVersion`
- `verifiedSha256`

On Ubuntu 24.04, provider ownership is split by tool:

- `apt` for `cmake`, `ninja`, and `clang++`
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

### Ubuntu 24.04 managed host bootstrap

```bash
npm --prefix packages run cppx -- install-tools
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
