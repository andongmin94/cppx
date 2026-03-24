# 마이그레이션

cppx는 schema v2 중심으로 동작합니다. 기존 프로젝트가 옛 설정이나 루트 생성물을 사용하고 있어도 가능한 범위에서는 자동으로 옮겨 줍니다.

## 자동 마이그레이션 대상

### `.cppx/project.json`

레거시 `.cppx/project.json`이 있으면 cppx가 이를 읽어서 `.cppx/config.toml`을 새로 생성합니다.

이때 기본적으로 옮겨지는 값은 다음과 같습니다.

- 프로젝트 이름
- 호스트에 맞는 기본 backend
- 호스트/컴파일러에 맞는 기본 tool policy
- schema v2 기본 preset

### 루트 `vcpkg.json`

루트 `vcpkg.json`에 `dependencies` 배열이 있으면 `[dependencies].packages`로 가져옵니다.

## 정리되는 레거시 생성물

다음 파일과 폴더는 더 이상 source of truth가 아닙니다.

- 루트 `CMakeLists.txt`
- 루트 `CMakePresets.json`
- 루트 `vcpkg.json`
- `.cppx/generated`

`init`, `build`, `run` 과정에서 위 경로들은 레거시 생성물로 보고 정리됩니다.

## 새 기준점

마이그레이션 이후에는 아래를 기준으로 작업하면 됩니다.

- 설정 원본: `.cppx/config.toml`
- 생성물: `.cppx/CMakeLists.txt`, `.cppx/CMakePresets.json`, backend manifest, `.vscode/*`

즉, 생성물보다 `config.toml`을 먼저 고치는 방식으로 생각하는 편이 맞습니다.

## 수동으로 확인할 항목

자동 마이그레이션이 끝난 뒤에는 아래를 확인하는 것이 안전합니다.

### 1. backend 선택

`[project].dependency_backend`가 현재 의도와 맞는지 확인합니다.

- Windows 기본값: `vcpkg`
- macOS / Linux 기본값: `none`

### 2. tool policy

`[tools.*]`와 `[compiler]`가 실제 호스트에 맞는지 확인합니다.

- Windows MinGW 관리형 사용 여부
- MSVC를 system 모드로 고정할지
- macOS / Linux에서 system 도구를 그대로 쓸지

### 3. preset 구조

과거의 고정 `debug/release` 가정 대신 `[[presets]]` 배열을 직접 보게 됩니다.

다음 항목을 확인합니다.

- `default_preset`
- 각 preset의 `target_triplet`
- 각 preset의 `runnable`

## 추천 점검 순서

```bash
cd packages
npm run cppx -- status
npm run cppx -- build <workspace>
npm run cppx -- run <workspace>
```

GUI를 쓰는 경우에는 작업 폴더를 연 뒤 `config 불러오기`로 현재 값을 확인하고, 필요하면 `config 저장`으로 schema v2 값을 다시 기록하면 됩니다.

## 자주 바뀌는 개념

| 예전 개념 | 지금 기준 |
|---|---|
| `.cppx/project.json` | `.cppx/config.toml` |
| 루트 `vcpkg.json` | `.cppx/vcpkg.json` 또는 `.cppx/conanfile.txt` |
| 고정 `debug/release` | `[[presets]]` 배열 |
| 수동 CMake/VSCode 정리 | config 기준 자동 생성 |

## 주의할 점

- `dependency_backend = "none"`이면 `cppx add`를 사용할 수 없습니다.
- `dependency_backend = "conan"`이면 시스템에 Conan이 따로 있어야 합니다.
- macOS와 Linux는 native host 워크플로를 지원하지만 관리형 CMake/Ninja/vcpkg catalog는 아직 없습니다.
