# cppx 시작하기

cppx는 C++ 프로젝트를 `init -> add -> build -> run -> test -> pack` 흐름으로 다루게 해 주는 Electron 앱 + CLI입니다.

핵심은 한 가지입니다. 사용자가 직접 CMake 설정, 프리셋, backend manifest, VSCode 작업 파일을 여기저기 따로 만지지 않고 `.cppx/config.toml`을 기준으로 워크플로를 관리하게 만드는 것입니다.

## 이 가이드에서 다루는 내용

- [도구 설치](./install.md): 운영체제별 기본 도구 정책과 `install-tools` 사용법
- [CLI 사용법](./cli.md): init, add, build, run, test, pack, status, doctor 명령
- [설정 (config.toml)](./config.md): schema v3 설정 구조와 생성물 반영 방식
- [GUI 사용법](./gui.md): GUI에서 백엔드, 도구 정책, 프리셋, 빌드를 다루는 방법
- [마이그레이션](./migration.md): 레거시 `.cppx/project.json`과 루트 생성물에서 현재 config 구조로 옮기는 방법

## CLI와 GUI의 관계

cppx는 두 가지 인터페이스를 제공합니다.

- CLI: 터미널에서 `cppx build`, `cppx run`처럼 빠르게 실행
- GUI: Electron 앱에서 작업 폴더 선택, 설정 편집, 도구 상태 확인, 로그 확인

두 인터페이스는 같은 코어 서비스(`CppxService`)를 사용하므로, 설정 해석과 실행 결과의 기준은 동일합니다.

## 빠른 시작

### 1. 의존성 설치

```bash
npm --prefix packages install
```

### 2. 도구 상태 준비

```bash
npm --prefix packages run cppx -- install-tools
```

- Windows: managed CMake, Ninja, vcpkg, Conan, and MinGW tooling are available from `cppx`.
- macOS 14+: managed Homebrew/archive paths are supported for the official host slice.
- Ubuntu 24.04: managed `apt`/archive/`pipx` paths are supported for the official Linux slice.
- Other Linux: conservative system detection only.

### 3. 프로젝트 초기화

```bash
npm --prefix packages run cppx -- init ./myapp --name myapp
npm --prefix packages run cppx -- doctor ./myapp
```

초기화가 끝나면 다음 파일들이 생성됩니다.

| 파일 | 역할 |
|---|---|
| `src/main.cpp` | 시작용 C++ 소스 |
| `.cppx/config.toml` | schema v3 프로젝트 설정 |
| `build/.cppx/CMakeLists.txt` | 생성된 CMake 스크립트 |
| `build/.cppx/CMakePresets.json` | configure/build/test/pack 프리셋 |
| `build/.cppx/vcpkg.json` 또는 `build/.cppx/conanfile.txt` | 선택한 backend용 manifest |
| `.vscode/tasks.json` | VSCode 작업 정의 |
| `.vscode/launch.json` | 실행 가능한 프리셋용 디버그 설정 |

### 4. 빌드와 실행

```bash
npm --prefix packages run cppx -- build ./myapp
npm --prefix packages run cppx -- run ./myapp
```

`run`은 `cargo run`처럼 build를 먼저 수행한 뒤 바이너리를 실행합니다.

::: tip 생성물은 직접 수정하지 않는 편이 맞습니다
`.cppx/config.toml`을 기준으로 `build/.cppx` 아래의 CMake/backend 생성물과 `cppx:`가 붙은 VSCode 관리 항목이 다시 생성됩니다. 생성물은 결과물로 보고, 설정 원본은 `config.toml`을 유지하는 편이 안전합니다.
:::

## GUI로 시작하기

```bash
npm --prefix packages install
npm --prefix packages run dev
```

GUI에서는 작업 폴더 선택, 설정 불러오기/저장, 도구 정책 편집, 프리셋 매트릭스 수정, Build/Run/Test/Pack, 로그 확인까지 같은 워크플로를 마우스로 다룰 수 있습니다.

## 현재 지원 범위

| Item | Windows | macOS | Linux |
|---|---|---|---|
| Default backend | `vcpkg` | `none` | `none` |
| Default tool mode | managed + system mixed | managed on official macOS hosts | managed on Ubuntu 24.04, system on other Linux |
| Managed core tools | archive-managed `cmake`, `ninja`, `vcpkg`, `conan`, `cxx` | Homebrew/archive-managed official slice | Ubuntu 24.04 uses `apt`/archive/`pipx`; other Linux stays system-only |
| Conan backend | managed archive path | managed Homebrew path | Ubuntu 24.04 managed `pipx`; other Linux system-only |

자세한 제한 사항은 [도구 설치](./install.md)와 [마이그레이션](./migration.md) 문서를 함께 보는 것이 좋습니다.
