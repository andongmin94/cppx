# 마이그레이션 가이드

이 문서는 기존 cppx 프로젝트를 현재 구조로 옮길 때 무엇이 자동으로 유지되고, 무엇을 직접 확인해야 하는지 정리합니다.

## 누가 읽어야 하나요?

다음 중 하나에 해당하면 이 페이지를 보는 것이 좋습니다.

- 과거 `.cppx/project.json`을 사용하던 프로젝트
- 루트 `vcpkg.json`을 직접 두고 cppx를 쓰던 프로젝트
- 고정된 `debug` / `release` 프리셋만 쓰던 프로젝트
- Windows 기본 동작만 가정하고 새 버전으로 올라오는 프로젝트

## 그대로 유지되는 것

- 기본 CLI 흐름은 그대로입니다. `init -> add -> build -> run -> test -> pack` 명령 체계는 유지됩니다.
- Windows 기본 사용자 경험도 유지됩니다. 기본 backend는 `vcpkg`이고, 관리형 CMake / Ninja / vcpkg / MinGW 설치가 계속 동작합니다.
- 기존 `.cppx/project.json`과 루트 `vcpkg.json`은 계속 읽힙니다.
- 생성물은 여전히 cppx가 다시 만듭니다. `CMakeLists.txt`, `CMakePresets.json`, backend manifest, VSCode 설정을 직접 편집하는 방식은 권장되지 않습니다.

## 가장 크게 달라진 점

### 1. 설정 원본이 `.cppx/config.toml` v2로 통합됐습니다

이제 설정의 중심은 `.cppx/config.toml`입니다.

- 프로젝트 메타데이터는 `[project]`
- 컴파일러 힌트는 `[compiler]`
- 의존성은 `[dependencies]`
- CMake 옵션은 `[cmake]`
- 도구 정책은 `[tools.*]`
- 프리셋은 `[[presets]]`

### 2. dependency backend가 명시적 설정이 됐습니다

이전에는 사실상 `vcpkg` 중심이었지만, 이제는 아래 중 하나를 명시할 수 있습니다.

- `vcpkg`
- `conan`
- `none`

`none`을 선택하면 `cppx add`는 거부되고, 의존성 관리는 사용자가 직접 해야 합니다.

### 3. 도구 설치 방식이 `[tools.*]`로 분리됐습니다

각 도구는 `managed` 또는 `system` 모드로 다룰 수 있습니다.

```toml
[tools.cmake]
mode = "managed"
version = "default"

[tools.cxx]
mode = "system"
version = "default"
preferred_family = "msvc"
```

이 구조 덕분에 Windows는 관리형 설치를 유지하고, macOS/Linux는 system 도구 기반 워크플로를 기본으로 사용할 수 있습니다.

### 4. 프리셋이 고정 쌍이 아니라 데이터로 관리됩니다

이전에는 사실상 `debug-*`, `release-*`를 기본으로 생각하면 됐지만, 이제는 `[[presets]]` 배열이 실제 원본입니다.

```toml
[[presets]]
name = "debug-x64"
display_name = "Debug x64"
build_type = "Debug"
target_triplet = "x64-mingw-dynamic"
runnable = true
```

`default_preset`도 함께 저장되며, `runnable = false`인 프리셋은 `cppx run`과 VSCode launch에서 제외됩니다.

## 자동 마이그레이션에서 기대할 수 있는 것

새 버전이 기존 설정을 읽어야 할 때, 레거시 파일이 있으면 `.cppx/config.toml` v2 파일을 생성합니다.

자동으로 이어지는 대표 항목은 다음과 같습니다.

| 레거시 입력 | 현재 결과 |
|---|---|
| `.cppx/project.json`의 프로젝트 이름 | `[project].name` |
| 루트 `vcpkg.json`의 dependency 목록 | `[dependencies].packages` |
| 기존 워크스페이스 이름 | `default_preset`, `source_file`, `target_triplet` 등의 기본값 계산 |

자동 마이그레이션은 시작점만 만들어 줍니다. backend, 도구 정책, 프리셋 구조를 새 기능에 맞게 다듬는 것은 사용자가 한 번 확인하는 편이 안전합니다.

## 권장 마이그레이션 순서

### 1. 먼저 현재 설정 파일을 확인합니다

프로젝트 루트에서 아래 파일이 생겼는지 봅니다.

```text
.cppx/config.toml
```

이미 파일이 있다면 그것이 현재 기준 설정 원본입니다.

### 2. `[project]` 섹션을 먼저 확인합니다

특히 아래 네 항목을 확인하는 것이 중요합니다.

- `default_preset`
- `source_file`
- `target_triplet`
- `dependency_backend`

Windows에서 기존 프로젝트를 그대로 이어가는 경우라면 보통 `dependency_backend = "vcpkg"`가 자연스럽습니다.
macOS/Linux 네이티브 워크플로를 쓰려면 기본값이 `none`일 수 있으니 의도한 값인지 확인해야 합니다.

### 3. backend를 의도에 맞게 고릅니다

- `vcpkg`를 계속 쓸 계획이면 `dependency_backend = "vcpkg"`
- Conan 기반으로 옮길 계획이면 `dependency_backend = "conan"`
- plain CMake 프로젝트처럼 가고 싶다면 `dependency_backend = "none"`

주의:

- `conan` backend를 쓰더라도 Conan 자체는 별도 설치해야 합니다.
- macOS/Linux용 관리형 vcpkg/CMake/Ninja catalog 설치는 아직 없습니다.

### 4. 도구 정책을 확인합니다

새 구조에서는 도구마다 `managed/system`을 따로 가질 수 있습니다.

일반적인 기준은 아래와 같습니다.

| 호스트 | 기본적인 권장값 |
|---|---|
| Windows | `cmake`, `ninja`, `vcpkg`, `cxx(mingw)`는 `managed`, MSVC는 `system` |
| macOS | `cmake`, `ninja`, `cxx`를 `system` |
| Linux | `cmake`, `ninja`, `cxx`를 `system` |

### 5. 프리셋을 `[[presets]]` 기준으로 정리합니다

기존 프로젝트가 고정 `debug/release`만 썼더라도 그대로 동작은 합니다.
다만 아래와 같은 경우에는 프리셋을 명시적으로 적는 편이 좋습니다.

- 다른 `target_triplet`을 함께 쓰는 경우
- 릴리스용과 로컬 실행용 프리셋을 분리하려는 경우
- `runnable = false` 프리셋을 두고 CI/패키징 전용으로 쓰려는 경우

## 기존 사용자가 직접 확인해야 할 항목

- `.cppx/config.toml`이 생성된 뒤에도 생성물 파일을 수동으로 편집하고 있지 않은지
- `dependency_backend`가 실제 사용하는 방식과 맞는지
- `[[presets]]`의 `name`과 `default_preset`이 서로 일치하는지
- `runnable = false` 프리셋을 기본 프리셋으로 두지 않았는지
- macOS/Linux에서 system 도구가 PATH에 실제로 잡히는지
- Conan을 선택했는데 `conan` 명령이 아직 설치되지 않은 상태는 아닌지

## Windows 사용자 메모

- 예전 `%LOCALAPPDATA%/cppx/tools/` 레이아웃은 자동 마이그레이션됩니다.
- MSVC를 쓰고 싶다면 `[tools.cxx]` 또는 `install-tools --compiler msvc`로 정책을 맞추는 편이 명확합니다.
- 기존 MinGW 관리형 흐름은 계속 유지됩니다.

## macOS / Linux 사용자 메모

- 기본 backend가 `none`일 수 있으므로, 의존성 관리가 필요하면 `vcpkg` 또는 `conan` 전환 여부를 먼저 결정해야 합니다.
- 현재는 system 도구 기반 워크플로가 기본입니다.
- `cmake`, `ninja`, `clang++` 또는 `g++`가 PATH에 없으면 `build`, `run`, `test`, `pack`이 실패합니다.

## GUI로 옮길 때 기억할 점

이제 GUI에서도 아래 항목을 직접 수정할 수 있습니다.

- `dependency_backend`
- `default_preset`
- `target_triplet`
- `[tools.*]`
- `[[presets]]`
- `[cmake]`

탐색 탭에서 값을 수정한 뒤 **config 저장**을 누르면 `.cppx/config.toml`이 갱신됩니다.

## 추천 점검 명령

```bash
cd packages
npm run cppx -- status
npm run cppx -- build ./myapp
```

Windows가 아니라면 필요에 따라 아래도 같이 확인합니다.

```bash
cd packages
npm run smoke:native
```

이 단계까지 문제 없이 통과하면, 대체로 마이그레이션된 설정이 현재 호스트와 맞게 정렬됐다고 봐도 됩니다.
