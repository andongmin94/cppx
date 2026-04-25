# cppx

cppx is a Cargo-like workflow tool for C++ projects. It manages CMake presets,
dependency backends, host tool detection, and optional managed tool installs from
one desktop UI and CLI.

## Current Host Policy

cppx has an explicit host policy instead of treating every platform as best
effort.

| Host | Direction |
| --- | --- |
| Windows x64 | Official. Default path is cppx-managed portable MinGW/LLVM-MinGW. MSVC is supported as an external system compiler. |
| macOS 14+ x64/arm64 | Official. Managed tools use the host provider path, primarily Homebrew. |
| Ubuntu 22.04/24.04/26.04 LTS x64/arm64 | Official. Managed tools use apt, pipx, or cppx-verified archives depending on the tool. |
| Other Linux | Unsupported. cppx does not install, detect, or run tools on these hosts. |

See [docs/toolchain-policy.md](docs/toolchain-policy.md) for the full compiler,
provider, and strategy matrix.

## Toolchain Strategy

Project config schema v4 stores the selected strategy:

```toml
[toolchain]
strategy = "recommended"
```

Supported values are `recommended`, `portable`, `provider`, and `system`.
The CLI exposes the same setting on `init` and `install-tools`:

```sh
npm run cppx -- init --strategy recommended
npm run cppx -- install-tools --strategy system
```

## Development

```sh
npm ci
npm run typecheck
npm test
npm run build
```

Run `npm audit` when dependencies change. The lockfile is expected to stay at
zero known vulnerabilities.
