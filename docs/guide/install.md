# 도구 설치

`cppx`는 호스트별로 다른 provider 경로를 사용합니다.

- Windows x64: `archive` 기반 managed 도구
- macOS 14+: Homebrew 기반 managed 도구 + `vcpkg` archive/bootstrap
- Linux: 현재는 `system` 도구 중심

## 기본 명령

```bash
cd packages
npm run cppx -- install-tools
```

## 호스트별 기본값

| 호스트 | 기본 backend | CMake / Ninja | vcpkg | conan | C++ 컴파일러 |
|---|---|---|---|---|---|
| Windows x64 | `vcpkg` | `managed` | `managed` | `system` | `managed`(MinGW) 또는 `system`(MSVC) |
| macOS 14+ | `none` | `managed` | `managed` | `managed` | `managed`(Homebrew llvm) |
| Linux | `none` | `system` | 필요할 때 별도 준비 | `system` | `system` |

## 사전 조건

### Windows

- 기본 설정이면 `cppx`가 필요한 아카이브를 내려받아 설치합니다.
- MSVC를 쓰려면 Visual Studio Build Tools 또는 Visual Studio의 C++ 워크로드가 준비돼 있어야 합니다.

### macOS 14+

- Homebrew가 있어야 managed host-tool 경로를 사용할 수 있습니다.
- `cppx install-tools`는 Homebrew로 `cmake`, `ninja`, `conan`, `llvm`을 준비하고, `vcpkg`는 검증된 archive를 내려받아 bootstrap합니다.

### Linux

- 현재는 `cmake`, `ninja`, `clang++` 또는 `g++`, 필요하면 `conan`이 PATH에 보여야 합니다.
- Ubuntu/Debian 예시:

```bash
sudo apt-get install cmake ninja-build build-essential
```

## 설치 정책

각 도구는 `managed` 또는 `system` 정책을 가집니다.

- `managed`
  - Windows: archive 기반 설치
  - macOS: Homebrew 또는 archive 기반 설치
  - 설치 기록은 manifest에 남고, 소유권은 `cppx-owned` 또는 `external`로 구분됩니다.
- `system`
  - 현재 PATH 또는 MSVC 감지 결과를 사용합니다.

`status`와 `doctor`는 다음 메타데이터를 함께 보여 줍니다.

- `mode`
- `provider`
- `ownership`
- `requestedVersion`
- `resolvedVersion`
- `verifiedSha256`

## 예시

### Windows에서 MinGW 정책으로 설치

```bash
npm run cppx -- install-tools --compiler mingw
```

### Windows에서 MSVC 정책으로 설치

```bash
npm run cppx -- install-tools --compiler msvc --msvc-installation-path "C:\Program Files\Microsoft Visual Studio\2022\BuildTools"
```

### macOS에서 managed host 도구 설치

```bash
npm run cppx -- install-tools
```

### Linux에서 system 도구 상태 확인

```bash
npm run cppx -- install-tools
```

Linux에서는 현재 이 명령이 PATH의 system 도구를 확인하고 manifest를 갱신하는 쪽에 가깝습니다.

## 상태 확인

```bash
npm run cppx -- status
npm run cppx -- doctor
```

- `status`는 각 도구의 준비 상태와 provenance를 요약합니다.
- `doctor`는 blocker, warning, next steps를 구분해서 보여 줍니다.

## 검증용 명령

```bash
cd packages
npm run test
npm run smoke:native
```

`smoke:native`는 현재 호스트에서 `init -> build -> run -> test -> pack` 흐름을 확인합니다.
