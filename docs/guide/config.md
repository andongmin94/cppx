# 설정 (`config.toml`)

cppx 프로젝트 설정은 `.cppx/config.toml`에서 관리합니다.

`build`, `run`, `test`, `pack`을 실행할 때 cppx는 이 설정을 기준으로 다음 파일을 다시 생성합니다.

- `build/.cppx/CMakeLists.txt`
- `build/.cppx/CMakePresets.json`
- `build/.cppx/vcpkg.json` 또는 `build/.cppx/conanfile.txt`
- `.vscode/tasks.json`
- `.vscode/launch.json`

`.cppx/`는 사용자 설정 공간이고, `build/.cppx/`는 cppx가 소유하는 생성물 공간입니다.

현재 설정 스키마는 `schema_version = 3`입니다. 기존 schema v2 파일은 읽을 수 있고, 다시 저장하면 v3로 올라갑니다.

## 예시

```toml
# cppx configuration

[project]
schema_version = 3
name = "myapp"
target_name = "myapp"
default_preset = "asan-x64"
source_file = "src/main.cpp"
cxx_standard = 20
target_triplet = "x64-mingw-dynamic"
dependency_backend = "vcpkg"

[package]
version = "0.1.0"
vendor = "myapp"
generators = ["ZIP"]
output_dir = "dist"

[compiler]
preferred_family = "mingw"

[dependencies]
packages = ["fmt", "spdlog"]

[cmake]
compile_definitions = ["USE_SSL", "APP_VERSION=1"]
compile_options = ["-Wall", "-Wextra"]
include_directories = ["include", "third_party/fmt/include"]
link_libraries = ["ws2_32", "bcrypt"]

[tools.cmake]
mode = "managed"
version = "default"

[tools.ninja]
mode = "managed"
version = "default"

[tools.vcpkg]
mode = "managed"
version = "default"

[tools.cxx]
mode = "managed"
version = "latest"
preferred_family = "mingw"

[[presets]]
name = "asan-x64"
display_name = "ASan x64"
build_type = "Debug"
target_triplet = "x64-mingw-dynamic"
runnable = true

[[presets]]
name = "arm64-release"
display_name = "ARM64 Release"
build_type = "Release"
target_triplet = "arm64-windows"
runnable = false
```

## `[project]`

프로젝트 기본 메타데이터와 생성 정책을 정의합니다.

| 키 | 설명 | 기본값 |
|---|---|---|
| `schema_version` | 설정 스키마 버전 | `3` |
| `name` | 프로젝트 이름 | 작업 폴더 이름 |
| `target_name` | 안전한 CMake 타깃 이름 | `name`에서 자동 파생 |
| `default_preset` | `--preset`을 생략했을 때 사용할 프리셋 | `debug-<host-arch>` |
| `source_file` | 메인 소스 파일 경로 | `src/main.cpp` |
| `cxx_standard` | C++ 표준 버전 | `20` |
| `target_triplet` | 기본 triplet | 컴파일러 계열과 호스트에 따라 자동 결정 |
| `dependency_backend` | dependency backend | 호스트 기본값 |

`default_preset`이 존재하지 않는 이름이면 cppx가 첫 번째 preset으로 자동 보정합니다.

호스트 기본값은 다음과 같습니다.

| 호스트 | `dependency_backend` | 기본 도구 모드 |
|---|---|---|
| Windows | `vcpkg` | `cmake`/`ninja`/`vcpkg`/MinGW는 `managed`, MSVC는 `system` |
| macOS | `none` | 모든 도구가 `system` |
| Linux | `none` | 모든 도구가 `system` |

`target_triplet` 기본값은 호스트와 컴파일러에 따라 자동 결정됩니다.

- Windows + MinGW: `x64-mingw-dynamic`
- Windows + MSVC: `x64-windows`
- macOS: `x64-osx` 또는 `arm64-osx`
- Linux: `x64-linux` 또는 `arm64-linux`

## `[compiler]`

컴파일러 계열과 MSVC 경로 기본값을 정의합니다.

| 키 | 설명 |
|---|---|
| `preferred_family` | `mingw` 또는 `msvc` |
| `msvc_installation_path` | 특정 Visual Studio 설치 경로를 우선 사용 |

## `[package]`

패키징 메타데이터는 `[package]`에서 관리합니다.

| 키 | 설명 | 기본값 |
|---|---|---|
| `version` | CPack과 package preset에 쓰는 버전 문자열 | `0.1.0` |
| `vendor` | 패키지 벤더 이름 | 프로젝트 이름 |
| `generators` | 사용할 CPack generator 목록 | `["ZIP"]` |
| `output_dir` | 패키지 출력 디렉터리 | `dist` |
| `license_file` | 선택적 라이선스 파일 경로 | 없음 |
| `readme_file` | 선택적 README 파일 경로 | 없음 |
| `icon` | 선택적 패키지 아이콘 경로 | 없음 |

`target_name`은 내부 CMake 타깃 식별자이고, `[package]`는 사용자에게 보이는 패키지 메타데이터입니다. 둘은 분리해서 생각하는 편이 안전합니다.

## `[dependencies]`

의존성 목록은 `packages` 배열 하나로 관리합니다.

```toml
[dependencies]
packages = ["fmt", "boost-asio", "nlohmann-json"]
```

실제 생성물은 `dependency_backend`에 따라 달라집니다.

- `vcpkg`: `build/.cppx/vcpkg.json` 생성
- `conan`: `build/.cppx/conanfile.txt` 생성
- `none`: 별도 backend manifest를 만들지 않음

`dependency_backend = "none"`일 때는 `cppx add`를 사용할 수 없습니다.

## `[cmake]`

`[cmake]` 항목은 생성되는 `CMakeLists.txt`에 그대로 반영됩니다.

- `compile_definitions` -> `target_compile_definitions(... PRIVATE ...)`
- `compile_options` -> `target_compile_options(... PRIVATE ...)`
- `include_directories` -> `target_include_directories(... PRIVATE ...)`
- `link_libraries` -> `target_link_libraries(... PRIVATE ...)`

GUI의 **CMake 설정** 카드에서도 같은 값을 읽고 저장할 수 있습니다.

## `[tools.*]`

도구별 설치 정책을 정의합니다.

### 공통 키

| 키 | 설명 |
|---|---|
| `mode` | `managed` 또는 `system` |
| `version` | `default`, `latest`, 또는 정확한 버전 문자열 |

Windows는 관리형 도구를 기본으로, macOS와 Linux는 system 도구를 기본으로 사용합니다.

### 컴파일러 전용 키

`[tools.cxx]`는 아래 키를 추가로 지원합니다.

| 키 | 설명 |
|---|---|
| `preferred_family` | `mingw` 또는 `msvc` |
| `msvc_installation_path` | 특정 MSVC 설치 경로 |

예시:

```toml
[tools.cxx]
mode = "system"
version = "default"
preferred_family = "msvc"
msvc_installation_path = "C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools"
```

## `[[presets]]`

프리셋은 배열 테이블로 정의합니다. 각 항목은 configure, build, test, package preset 생성에 반영됩니다.

| 키 | 설명 |
|---|---|
| `name` | 프리셋 고유 이름 |
| `display_name` | UI 표시 이름 |
| `build_type` | `Debug`, `Release` 같은 CMake build type |
| `target_triplet` | 프리셋별 triplet |
| `runnable` | 로컬 호스트에서 실행 가능한 프리셋인지 여부 |

`runnable = false`인 프리셋은 다음에서 제외되거나 거부됩니다.

- `.vscode/launch.json`

- `cppx: run ...` VSCode task
- `cppx run`

VSCode 파일은 통째로 덮어쓰지 않고, `cppx:` 접두사가 붙은 관리 항목만 교체합니다.

프리셋이 하나도 없으면 cppx는 기본적으로 `debug-<host-arch>`, `release-<host-arch>`를 생성합니다.

## backend별 동작

### `dependency_backend = "vcpkg"`

- `build/.cppx/vcpkg.json`을 생성합니다.
- `CMakePresets.json`에 vcpkg toolchain file과 `VCPKG_TARGET_TRIPLET`를 반영합니다.

### `dependency_backend = "conan"`

- `build/.cppx/conanfile.txt`를 생성합니다.
- configure 전에 `build/.cppx` 폴더에서 `conan install . --output-folder . --build missing`를 실행합니다.
- VSCode task에도 Conan 준비 단계가 포함됩니다.
- `conan` 명령은 시스템에 별도로 설치돼 있어야 합니다.

### `dependency_backend = "none"`

- backend manifest를 생성하지 않습니다.
- plain CMake 프로젝트처럼 동작합니다.
- 의존성 추가는 사용자가 직접 관리해야 합니다.

## 자동 생성 파일과의 관계

| 생성 파일 | 반영되는 설정 |
|---|---|
| `build/.cppx/CMakeLists.txt` | `[project]`, `[cmake]` |
| `build/.cppx/CMakePresets.json` | `dependency_backend`, `[[presets]]`, 컴파일러 경로, triplet |
| `build/.cppx/vcpkg.json` | `[dependencies].packages` when `vcpkg` |
| `build/.cppx/conanfile.txt` | `[dependencies].packages` when `conan` |
| `.vscode/tasks.json` | `dependency_backend`, `[[presets]]` |
| `.vscode/launch.json` | 실행 가능한 `[[presets]]` |

## 레거시 마이그레이션

이전 버전의 `.cppx/project.json`과 루트 `vcpkg.json`은 자동 마이그레이션 대상입니다.

- `.cppx/project.json`이 있으면 schema v3 형식의 `.cppx/config.toml`을 새로 만듭니다.
- 루트 `vcpkg.json`에 `dependencies`가 있으면 `[dependencies].packages`로 가져옵니다.

자세한 절차와 주의점은 [마이그레이션 가이드](./migration.md)를 참고하면 됩니다.
