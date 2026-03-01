# 설정 (config.toml)

cppx 프로젝트의 모든 설정은 `.cppx/config.toml` 한 파일에서 관리됩니다. 이 파일을 수정하면 빌드 시 `CMakeLists.txt`, `CMakePresets.json`, `vcpkg.json`이 자동으로 다시 생성됩니다. 생성된 파일을 직접 수정할 필요가 없습니다.

## 전체 구조

```toml
# cppx configuration

[project]
name = "myapp"
default_preset = "debug-x64"
source_file = "src/main.cpp"
cxx_standard = 20
target_triplet = "x64-mingw-dynamic"

[dependencies]
packages = ["fmt", "boost-asio"]

[cmake]
compile_definitions = ["USE_SSL", "APP_VERSION=1"]
compile_options = ["-Wall", "-Wextra"]
include_directories = ["include"]
link_libraries = ["ws2_32"]
```

## [project] 섹션

프로젝트의 기본 정보를 정의합니다.

| 키 | 설명 | 기본값 |
|----|------|--------|
| `name` | 프로젝트 이름 (바이너리 이름으로도 사용됩니다) | 폴더명 |
| `default_preset` | 기본 빌드 프리셋 | `debug-x64` |
| `source_file` | 메인 소스 파일 경로 | `src/main.cpp` |
| `cxx_standard` | C++ 표준 버전 | `20` |
| `target_triplet` | vcpkg 타겟 트리플렛 | 컴파일러에 따라 자동 설정 |

::: tip target_triplet은 컴파일러에 따라 달라집니다
MinGW를 사용하면 `x64-mingw-dynamic`, MSVC를 사용하면 `x64-windows`가 자동으로 설정됩니다. 특별한 사유가 없다면 수동으로 바꿀 필요가 없습니다.
:::

## [dependencies] 섹션

vcpkg로 관리할 C++ 패키지 목록입니다.

```toml
[dependencies]
packages = ["fmt", "boost-asio", "nlohmann-json"]
```

여기에 추가된 패키지는 빌드 시 vcpkg manifest 모드를 통해 자동으로 설치됩니다. CLI에서는 `cppx add <패키지명>`으로도 추가할 수 있습니다.

## [cmake] 섹션

생성되는 `CMakeLists.txt`에 반영될 CMake 타겟 옵션들입니다. C++ 프로젝트에서 자주 쓰이는 네 가지 설정을 지원합니다.

### compile_definitions

전처리기 매크로를 정의합니다. CMake의 `target_compile_definitions(... PRIVATE ...)`에 해당합니다.

```toml
compile_definitions = ["USE_SSL", "APP_VERSION=1", "DEBUG_MODE"]
```

### compile_options

컴파일러 플래그를 지정합니다. CMake의 `target_compile_options(... PRIVATE ...)`에 해당합니다.

```toml
compile_options = ["-Wall", "-Wextra", "-Wpedantic"]
```

### include_directories

추가 헤더 검색 경로를 지정합니다. CMake의 `target_include_directories(... PRIVATE ...)`에 해당합니다.

```toml
include_directories = ["include", "third_party/fmt/include"]
```

### link_libraries

추가로 링크할 라이브러리를 지정합니다. CMake의 `target_link_libraries(... PRIVATE ...)`에 해당합니다.

```toml
link_libraries = ["ws2_32", "bcrypt", "pthread"]
```

## GUI에서 설정 편집하기

GUI의 **탐색** 탭에서 **CMake 설정** 카드를 통해 같은 값들을 편집할 수 있습니다.

- **config 불러오기** — 현재 `.cppx/config.toml`의 `[cmake]` 섹션을 UI로 가져옵니다
- **config 저장** — UI에서 수정한 값을 `.cppx/config.toml`에 저장합니다

CLI와 GUI 어느 쪽에서 수정하든 동일한 파일을 기준으로 동작합니다.

## 자동 생성 파일과의 관계

`config.toml`을 수정하면 다음 빌드 시 아래 파일들이 자동으로 재생성됩니다.

| 생성 파일 | 반영되는 설정 |
|-----------|---------------|
| `.cppx/CMakeLists.txt` | `[project]` + `[cmake]` 전체 |
| `.cppx/CMakePresets.json` | `name`, `default_preset`, 컴파일러 경로 |
| `.cppx/vcpkg.json` | `[dependencies].packages` |

::: warning 자동 생성 파일은 직접 수정하지 마세요
`.cppx/CMakeLists.txt`, `.cppx/CMakePresets.json`, `.cppx/vcpkg.json`은 매 빌드마다 `config.toml` 기준으로 덮어씌워집니다. 수정이 필요하다면 반드시 `config.toml`을 통해 변경해 주세요.
:::

## 레거시 마이그레이션

이전 버전의 cppx에서 `.cppx/project.json`이나 루트의 `vcpkg.json`을 사용했다면, cppx가 자동으로 감지하여 `config.toml` 형식으로 마이그레이션합니다. 별도 조치 없이 기존 프로젝트를 그대로 사용할 수 있습니다.
