# 설정 (`config.toml`)

cppx 프로젝트의 설정은 `.cppx/config.toml` 한 파일에서 관리합니다.

`build`, `run`, `test`, `pack`이 실행될 때마다 cppx는 이 설정을 기준으로 다음 파일을 다시 생성합니다.

- `.cppx/CMakeLists.txt`
- `.cppx/CMakePresets.json`
- `.cppx/vcpkg.json` 또는 `.cppx/conanfile.txt`
- `.vscode/tasks.json`
- `.vscode/launch.json`

현재 설정 스키마는 `schema_version = 2`입니다.

## 예시

```toml
# cppx configuration

[project]
schema_version = 2
name = "myapp"
default_preset = "asan-x64"
source_file = "src/main.cpp"
cxx_standard = 20
target_triplet = "x64-mingw-dynamic"
dependency_backend = "vcpkg"

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

프로젝트의 기본 메타데이터와 생성 정책을 정의합니다.

| 키 | 설명 | 기본값 |
|---|---|---|
| `schema_version` | 설정 스키마 버전 | `2` |
| `name` | 프로젝트 이름 | 작업 폴더 이름 |
| `default_preset` | `--preset`을 생략했을 때 사용할 프리셋 | `debug-<host-arch>` |
| `source_file` | 메인 소스 파일 경로 | `src/main.cpp` |
| `cxx_standard` | C++ 표준 버전 | `20` |
| `target_triplet` | 기본 triplet | 컴파일러 계열에 따라 자동 결정 |
| `dependency_backend` | 의존성 백엔드 | 호스트별 기본값 |

`default_preset`이 존재하지 않는 프리셋 이름이면 cppx는 첫 번째 프리셋으로 자동 보정합니다.

호스트별 기본값은 다음과 같습니다.

| 호스트 | `dependency_backend` | 기본 도구 모드 |
|---|---|---|
| Windows | `vcpkg` | `cmake`/`ninja`/`vcpkg`/MinGW는 `managed`, MSVC는 `system` |
| macOS | `none` | 모든 도구가 `system` |
| Linux | `none` | 모든 도구가 `system` |

`target_triplet`은 Windows MinGW 계열이면 기본적으로 `x64-mingw-dynamic`, Windows MSVC 계열이면 `x64-windows`, macOS는 `x64-osx` 또는 `arm64-osx`, Linux는 `x64-linux` 또는 `arm64-linux`를 사용합니다.

## `[compiler]`

컴파일러 계열과 MSVC 인스턴스 힌트를 지정합니다.

| 키 | 설명 |
|---|---|
| `preferred_family` | `mingw` 또는 `msvc` |
| `msvc_installation_path` | 특정 Visual Studio 설치 경로를 우선 사용 |

## `[dependencies]`

의존성 목록은 항상 `packages` 배열로 저장합니다.

```toml
[dependencies]
packages = ["fmt", "boost-asio", "nlohmann-json"]
```

실제 생성물은 `dependency_backend`에 따라 달라집니다.

- `vcpkg`: `.cppx/vcpkg.json` 생성
- `conan`: `.cppx/conanfile.txt` 생성
- `none`: 별도 의존성 manifest를 생성하지 않음

`dependency_backend = "none"`에서는 `cppx add`를 사용할 수 없습니다.

## `[cmake]`

`[cmake]` 항목은 생성되는 `CMakeLists.txt`의 타겟 설정으로 반영됩니다.

- `compile_definitions` -> `target_compile_definitions(... PRIVATE ...)`
- `compile_options` -> `target_compile_options(... PRIVATE ...)`
- `include_directories` -> `target_include_directories(... PRIVATE ...)`
- `link_libraries` -> `target_link_libraries(... PRIVATE ...)`

## `[tools.*]`

도구별 설치 정책을 정의합니다.

### 공통 키

| 키 | 설명 |
|---|---|
| `mode` | `managed` 또는 `system` |
| `version` | `default`, `latest`, 또는 정확한 버전 문자열 |

Windows는 관리형 설치를 기본으로 사용하고, macOS/Linux는 system 도구를 기본으로 사용합니다.

### 컴파일러 전용 키

`[tools.cxx]`에서는 다음 항목도 함께 사용할 수 있습니다.

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

프리셋은 배열 테이블로 정의합니다. 각 항목은 configure, build, test, package 프리셋을 함께 생성합니다.

| 키 | 설명 |
|---|---|
| `name` | 프리셋 고유 이름 |
| `display_name` | 표시용 이름 |
| `build_type` | `Debug`, `Release` 같은 CMake build type |
| `target_triplet` | 프리셋별 triplet |
| `runnable` | 로컬 호스트에서 실행 가능한 프리셋인지 여부 |

`runnable = false`인 프리셋은 다음에서 제외되거나 거부됩니다.

- `.vscode/launch.json`
- `cppx: run ...` VSCode task
- `cppx run`

프리셋이 하나도 없으면 cppx는 기본적으로 `debug-<host-arch>`, `release-<host-arch>`를 자동 생성합니다.

## 백엔드별 동작

### `dependency_backend = "vcpkg"`

- `.cppx/vcpkg.json`을 생성합니다.
- `CMakePresets.json`에 vcpkg toolchain file과 `VCPKG_TARGET_TRIPLET`을 반영합니다.

### `dependency_backend = "conan"`

- `.cppx/conanfile.txt`를 생성합니다.
- configure 전에 `.cppx` 폴더에서 `conan install . --output-folder . --build missing`를 실행합니다.
- VSCode task에도 Conan 준비 단계가 포함됩니다.
- `conan` 명령은 시스템에 별도로 설치되어 있어야 합니다.

### `dependency_backend = "none"`

- 백엔드 manifest를 만들지 않습니다.
- plain CMake 프로젝트처럼 동작합니다.
- 의존성 추가는 사용자가 직접 관리해야 합니다.

## 자동 생성 파일과의 관계

| 생성 파일 | 반영되는 설정 |
|---|---|
| `.cppx/CMakeLists.txt` | `[project]`, `[cmake]` |
| `.cppx/CMakePresets.json` | `dependency_backend`, `[[presets]]`, 컴파일러 경로, triplet |
| `.cppx/vcpkg.json` | `[dependencies].packages` when `vcpkg` |
| `.cppx/conanfile.txt` | `[dependencies].packages` when `conan` |
| `.vscode/tasks.json` | `dependency_backend`, `[[presets]]` |
| `.vscode/launch.json` | 실행 가능한 `[[presets]]` |

## 레거시 마이그레이션

이전 버전의 `.cppx/project.json`과 루트 `vcpkg.json`은 계속 자동 마이그레이션됩니다.

마이그레이션이 일어나면 v2 형식의 `.cppx/config.toml`이 새로 생성됩니다.

프리셋 매트릭스, backend 선택, tool policy까지 포함한 전환 체크리스트는 [마이그레이션 가이드](./migration.md)에 따로 정리했습니다.
