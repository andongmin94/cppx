# 도구 설치

cppx는 호스트 운영체제에 따라 도구 정책을 다르게 해석합니다. Windows에서는 관리형 도구 설치를 기본으로 사용하고, macOS/Linux에서는 시스템 도구 기반 네이티브 워크플로를 기본으로 사용합니다.

## 빠른 시작

```bash
cd packages
npm run cppx -- install-tools
```

## 호스트별 기본 동작

| 호스트 | 기본 backend | CMake / Ninja | vcpkg | C++ 컴파일러 |
|---|---|---|---|---|
| Windows | `vcpkg` | `managed` | `managed` | `managed` (MinGW) 또는 `system` (MSVC) |
| macOS | `none` | `system` | 필요할 때만 별도 준비 | `system` |
| Linux | `none` | `system` | 필요할 때만 별도 준비 | `system` |

## 시스템 전제조건

- **Windows** — 기본 설정을 그대로 쓰면 cppx가 필요한 도구를 직접 설치합니다. MSVC를 쓰려면 Visual Studio Build Tools의 C++ 워크로드가 필요합니다.
- **macOS** — `cmake`, `ninja`, `clang++` 또는 `g++`가 PATH에 있어야 합니다. 예: `brew install cmake ninja`
- **Linux** — `cmake`, `ninja`, `clang++` 또는 `g++`가 PATH에 있어야 합니다. 예: Ubuntu/Debian `sudo apt-get install cmake ninja-build build-essential`
- **Conan** — `dependency_backend = "conan"`을 사용할 때는 Conan 2.x를 별도로 설치하고 `conan` 명령이 PATH에 있어야 합니다.

## 설치 정책

각 도구는 `managed` 또는 `system` 모드로 해석됩니다.

- `managed` — cppx가 자체 경로 아래 설치하고 manifest에 기록합니다.
- `system` — 현재 PATH 또는 MSVC 탐지 결과를 사용합니다.

manifest에는 다음 메타데이터가 저장됩니다.

- `mode`
- `sourceKind`
- `requestedVersion`
- `resolvedVersion`
- `compilerFamily`
- `catalogId`

## 설치 예시

### Windows에서 MinGW 기반 관리형 설치

```bash
npm run cppx -- install-tools --compiler mingw
```

### Windows에서 특정 MSVC 인스턴스 사용

```bash
npm run cppx -- install-tools --compiler msvc --msvc-installation-path "C:\Program Files\Microsoft Visual Studio\2022\BuildTools"
```

### macOS/Linux에서 시스템 도구 확인

```bash
npm run cppx -- install-tools
```

이 경우 cppx는 기본 정책에 따라 system 도구를 해석하고 manifest를 갱신합니다. 시스템에 필요한 도구가 없다면 명확한 오류를 반환합니다.

## 설치 상태 확인

```bash
npm run cppx -- status
```

가능하면 각 도구에 대해 다음 정보를 함께 표시합니다.

- 설치 모드
- 해석된 버전
- 소스 종류
- 실행 파일 경로

## 관리형 레이아웃

Windows 관리형 도구는 기본적으로 다음 경로 아래 저장됩니다.

```text
%LOCALAPPDATA%/cppx/
├─ cmake/
├─ ninja/
├─ vcpkg/
├─ cxx/
├─ downloads/
└─ tools-manifest.json
```

macOS와 Linux도 `tools-manifest.json`과 다운로드 캐시를 사용하지만, 현재 기본 정책은 system 도구이므로 관리형 catalog 설치는 제공하지 않습니다.

- macOS root: `~/Library/Application Support/cppx/`
- Linux root: `$XDG_DATA_HOME/cppx/` 또는 `~/.local/share/cppx/`

과거 Windows의 `%LOCALAPPDATA%/cppx/tools/` 레이아웃은 자동 마이그레이션됩니다.

## 개발자 검증

```bash
cd packages
npm run test
npm run smoke:native
```

`smoke:native`는 현재 호스트의 `cmake`, `ninja`, C++ 컴파일러를 사용해 `init -> build -> run -> test -> pack`을 짧게 검증합니다.

## 현재 범위

- macOS/Linux 네이티브 호스트의 `init`, `build`, `run`, `test`, `pack` 흐름을 system 도구 기준으로 지원합니다.
- Windows는 기존 관리형 설치와 MSVC 탐지 동작을 유지합니다.
- exact version 설치는 현재 catalog에 등록된 버전에 한해 지원합니다.
- macOS/Linux용 관리형 도구 catalog와 설치기는 아직 제공하지 않습니다.
