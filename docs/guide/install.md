# 도구 설치

cppx는 호스트 운영체제에 따라 도구 준비 방식을 다르게 해석합니다.

- Windows: 관리형 CMake, Ninja, vcpkg, MinGW 도구를 기본으로 사용하고 MSVC는 system 모드로 감지합니다.
- macOS / Linux: system 도구를 기본으로 사용합니다.

## 기본 명령

```bash
cd packages
npm run cppx -- install-tools
```

## 호스트별 기본값

| 호스트 | 기본 backend | CMake / Ninja | vcpkg | C++ 컴파일러 |
|---|---|---|---|---|
| Windows | `vcpkg` | `managed` | `managed` | `managed` (MinGW) 또는 `system` (MSVC) |
| macOS | `none` | `system` | 필요할 때만 별도 준비 | `system` |
| Linux | `none` | `system` | 필요할 때만 별도 준비 | `system` |

## 사전 조건

- Windows
  - 기본 설정이면 cppx가 필요한 도구를 내려받아 설치합니다.
  - MSVC를 쓰려면 Visual Studio Build Tools 또는 Visual Studio의 C++ 워크로드가 준비돼 있어야 합니다.
- macOS
  - `cmake`, `ninja`, `clang++` 또는 `g++`가 PATH에 있어야 합니다.
  - 예시: `brew install cmake ninja`
- Linux
  - `cmake`, `ninja`, `clang++` 또는 `g++`가 PATH에 있어야 합니다.
  - Ubuntu/Debian 예시: `sudo apt-get install cmake ninja-build build-essential`
- Conan
  - `dependency_backend = "conan"`을 쓰려면 Conan 2.x를 별도로 설치하고 `conan` 명령이 PATH에 있어야 합니다.

## 도구 정책

각 도구는 `managed` 또는 `system` 모드로 동작합니다.

- `managed`
  - cppx가 전용 경로 아래에 도구를 설치하고 manifest에 메타데이터를 기록합니다.
- `system`
  - 현재 PATH 또는 MSVC 탐지 결과를 사용합니다.

`status`가 보여 주는 상세 메타데이터는 다음과 같습니다.

- `mode`
- `sourceKind`
- `requestedVersion`
- `resolvedVersion`
- `compilerFamily`
- `catalogId`

## 설치 예시

### Windows에서 관리형 MinGW 사용

```bash
npm run cppx -- install-tools --compiler mingw
```

### Windows에서 특정 MSVC 설치 경로 사용

```bash
npm run cppx -- install-tools --compiler msvc --msvc-installation-path "C:\Program Files\Microsoft Visual Studio\2022\BuildTools"
```

### macOS / Linux에서 시스템 도구 상태 확인

```bash
npm run cppx -- install-tools
```

macOS와 Linux에서는 이 명령이 관리형 catalog를 설치하지 않습니다. 대신 시스템 도구를 확인하고 manifest를 갱신합니다.

## 상태 확인

```bash
npm run cppx -- status
```

예시 출력:

```text
cmake: ready (system, 3.30.5, system-detected, /usr/bin/cmake)
```

## 관리형 도구 저장 위치

Windows 관리형 도구는 기본적으로 아래 경로 아래에 저장됩니다.

```text
%LOCALAPPDATA%/cppx/
├─ cmake/
├─ ninja/
├─ vcpkg/
├─ cxx/
├─ downloads/
└─ tools-manifest.json
```

macOS와 Linux도 앱 데이터 루트와 `tools-manifest.json`을 사용하지만, 현재 기본 정책은 system 도구 기반이며 관리형 catalog는 제공하지 않습니다.

- macOS root: `~/Library/Application Support/cppx/`
- Linux root: `$XDG_DATA_HOME/cppx/` 또는 `~/.local/share/cppx/`

과거 Windows의 `%LOCALAPPDATA%/cppx/tools/` 레이아웃은 자동으로 새 위치로 마이그레이션됩니다.

## 검증용 명령

```bash
cd packages
npm run test
npm run smoke:native
```

`smoke:native`는 현재 호스트의 `cmake`, `ninja`, C++ 컴파일러를 이용해 `init -> build -> run -> test -> pack` 흐름을 검증합니다.

## 현재 제한 사항

- macOS와 Linux는 native host 워크플로를 지원하지만 관리형 CMake/Ninja/vcpkg catalog는 아직 없습니다.
- exact version 설치는 현재 catalog에 등록된 버전에 한해 동작합니다.
- Conan backend는 지원하지만 Conan 실행 파일 자체는 `install-tools`가 설치하지 않습니다.
