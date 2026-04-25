# cppx Toolchain Policy

This document is the source-level policy for host support, compiler defaults,
and toolchain strategies.

## Support Matrix

| Host | Tier | Managed lifecycle | Default compiler | Provider direction |
| --- | --- | --- | --- | --- |
| Windows x64 | official | yes | MinGW/LLVM-MinGW | cppx-owned portable archives |
| Windows x64 with MSVC selected | official | compiler is system-only | MSVC `cl.exe` | external Visual Studio / Build Tools |
| macOS 14+ x64/arm64 | official | yes when Homebrew is available | Clang | Homebrew/provider-managed |
| Ubuntu 22.04 LTS x64/arm64 | official | yes | Clang, GCC optional | apt, pipx, cppx archives |
| Ubuntu 24.04 LTS x64/arm64 | official | yes | Clang, GCC optional | apt, pipx, cppx archives |
| Ubuntu 26.04 LTS x64/arm64 | official | yes | Clang, GCC optional | apt, pipx, cppx archives |
| Other Linux | unsupported | no | none | none |

Unsupported Linux is intentionally blocked. cppx should not fall back to a
best-effort PATH-only mode there, because that makes bug reports and toolchain
state ambiguous.

## Compiler Policy

| Platform choice | Compiler |
| --- | --- |
| Windows default | MinGW/LLVM-MinGW |
| Windows MSVC selection | MSVC `cl.exe` |
| macOS | Clang |
| Ubuntu LTS default | Clang |
| Ubuntu LTS optional | GCC |

Windows has two distinct compiler families because the ABI/toolchain split is
real: MinGW/LLVM-MinGW is portable and cppx-managed, while MSVC belongs to the
Visual Studio installation and remains external. macOS and Ubuntu keep the
surface smaller because Clang/GCC are the practical host-provider compilers
there.

## Strategy Meanings

| Strategy | Meaning |
| --- | --- |
| `recommended` | Use the host default policy. Windows means portable MinGW; macOS means provider-managed; Ubuntu LTS means provider-managed. |
| `portable` | Prefer cppx-managed portable tool payloads. On non-Windows hosts this normalizes to the provider direction because portable compiler bundles are not the official path. |
| `provider` | Prefer the OS package/provider direction. On Windows this normalizes to portable because there is no single OS package provider for the default C++ stack. |
| `system` | Do not install managed tools; resolve external tools from the system. MSVC is always system-only. |

The resolver lives in `src/main/cppx/toolchain-strategy.ts`. Config files store
the strategy in schema v4 under `[toolchain]`.

## Tool Ownership

cppx distinguishes ownership from discovery:

| Ownership | Meaning |
| --- | --- |
| `cppx` | cppx installed or manages the tool record. |
| `external` | The tool comes from Visual Studio, PATH, Homebrew, apt, pipx, or another provider outside cppx ownership. |
| `unknown` | The resolver cannot prove ownership. |

Provider-managed tools can still be detected and used by cppx, but they should
not be described as portable cppx-owned tools.

## Dependency Backends

`dependency_backend = "none"` requires only CMake, Ninja, and a C++ compiler.
`vcpkg` additionally requires vcpkg. `conan` additionally requires Conan.

On Windows, Conan projects are validated against MSVC because the current Conan
path is MSVC-oriented. MinGW is better paired with `none` or `vcpkg` until a
separate MinGW Conan profile is formally supported.
