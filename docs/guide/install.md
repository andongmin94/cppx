# 도구 설치

cppx는 C++ 프로젝트를 빌드하기 위해 네 가지 도구를 사용합니다. 시스템에 이미 설치되어 있더라도, cppx는 자체 관리 경로(`%LOCALAPPDATA%/cppx/`)에 별도로 도구를 설치합니다. 이렇게 하면 기존 환경과 충돌할 걱정이 없습니다.

## 설치되는 도구

| 도구 | 버전 | 용도 |
|------|------|------|
| **CMake** | 3.30.5 | 빌드 시스템 생성 |
| **Ninja** | 1.12.1 | 고속 빌드 실행 |
| **vcpkg** | 최신 (rolling) | C++ 패키지 의존성 관리 |
| **C++ 컴파일러** | llvm-mingw 또는 MSVC | 소스 코드 컴파일 |

## 한 번에 설치하기

터미널에서 아래 명령 하나면 네 가지 도구가 모두 설치됩니다.

```bash
npm run cppx -- install-tools
```

설치가 완료되면 각 도구의 경로와 버전, 설치 시각이 `%LOCALAPPDATA%/cppx/tools-manifest.json`에 기록됩니다.

## 설치 경로

모든 도구는 `%LOCALAPPDATA%/cppx/` 하위에 정리됩니다.

```text
%LOCALAPPDATA%/cppx/
├─ cmake/          # CMake 바이너리
├─ ninja/          # Ninja 바이너리
├─ vcpkg/          # vcpkg 저장소 클론
├─ cxx/            # llvm-mingw 또는 MSVC 경로 정보
├─ downloads/      # 다운로드 캐시 (설치 후 정리)
└─ tools-manifest.json
```

## C++ 컴파일러 선택

cppx는 두 종류의 C++ 컴파일러를 지원합니다.

### MinGW (llvm-mingw)

- 별도 소프트웨어 설치 없이 cppx가 직접 다운로드합니다
- GitHub에서 최신 `llvm-mingw` ucrt-x86_64 릴리스를 자동으로 찾아 설치합니다
- Visual Studio가 설치되지 않은 환경에 적합합니다

### MSVC (Visual Studio)

- 시스템에 Visual Studio가 이미 설치되어 있다면 `vswhere.exe`로 자동 감지합니다
- 감지된 인스턴스가 여러 개일 경우, GUI에서 원하는 버전을 선택할 수 있습니다
- `VsDevCmd.bat`를 통해 MSVC 관련 환경변수를 자동으로 캡처합니다

::: tip 어떤 컴파일러를 쓸지 모르겠다면
MinGW를 추천합니다. 추가 소프트웨어 없이 바로 설치할 수 있고, 대부분의 C++ 프로젝트에서 문제없이 동작합니다.
:::

## 설치 상태 확인

현재 도구 설치 상태를 확인하려면 다음 명령을 사용합니다.

```bash
npm run cppx -- status
```

각 도구에 대해 `ready` 또는 `missing`으로 상태가 표시됩니다. GUI의 **빌드** 탭에서도 같은 정보를 뱃지로 확인할 수 있습니다.

## 업데이트

도구를 최신 버전으로 업데이트하려면 `install-tools`를 다시 실행하면 됩니다. vcpkg는 `git pull`로 갱신되고, 다른 도구는 새 버전으로 재설치됩니다.

## 문제가 생겼을 때

| 증상 | 해결 방법 |
|------|-----------|
| 다운로드가 자꾸 실패합니다 | 네트워크 환경을 확인해 주세요. cppx는 실패 시 최대 3회까지 자동 재시도합니다. |
| 설치 후에도 missing으로 나옵니다 | `%LOCALAPPDATA%/cppx/tools-manifest.json` 파일이 정상적으로 기록되었는지 확인해 주세요. |
| MSVC가 감지되지 않습니다 | Visual Studio Installer에서 "C++를 사용한 데스크톱 개발" 워크로드가 설치되어 있는지 확인해 주세요. |
