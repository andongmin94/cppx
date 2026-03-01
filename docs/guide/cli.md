# CLI 사용법

cppx CLI는 Cargo의 워크플로를 C++에 맞게 재현한 명령어 체계입니다. 프로젝트 초기화부터 빌드, 실행, 테스트, 패키징까지 일관된 인터페이스로 처리합니다.

## 명령어 실행 방법

cppx CLI는 프로젝트 내부에서 다음과 같이 실행합니다.

```bash
npm run cppx -- <command> [options]
```

## 명령어 목록

### `install-tools` — 도구 설치

CMake, Ninja, vcpkg, C++ 컴파일러를 `%LOCALAPPDATA%/cppx/` 하위에 설치합니다.

```bash
npm run cppx -- install-tools
```

자세한 내용은 [도구 설치](./install.md) 페이지를 참고해 주세요.

---

### `init` — 프로젝트 초기화

새로운 C++ 프로젝트를 생성합니다. `config.toml`, `src/main.cpp`, CMake 관련 파일, VSCode 설정까지 한 번에 만들어집니다.

```bash
npm run cppx -- init C:\dev\myapp --name myapp
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `-n, --name` | 프로젝트 이름 | 폴더명 |

생성되는 파일 목록은 [시작하기](./index.md#2단계-프로젝트-초기화) 페이지에서 확인할 수 있습니다.

---

### `add` — 의존성 추가

vcpkg 패키지를 프로젝트의 `.cppx/config.toml`에 추가합니다.

```bash
npm run cppx -- add fmt C:\dev\myapp
npm run cppx -- add boost-asio C:\dev\myapp
```

추가된 패키지는 다음 빌드 시 vcpkg를 통해 자동으로 설치됩니다.

---

### `build` — 빌드

CMake configure와 build를 프리셋 기반으로 수행합니다.

```bash
npm run cppx -- build C:\dev\myapp
npm run cppx -- build C:\dev\myapp --preset release-x64
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `-p, --preset` | 빌드 프리셋 | `debug-x64` |

빌드 전에 `config.toml`을 기준으로 `CMakeLists.txt`, `CMakePresets.json`, `vcpkg.json`이 자동으로 재생성됩니다.

---

### `run` — 빌드 & 실행

빌드를 먼저 수행한 뒤 생성된 바이너리를 실행합니다. Cargo의 `cargo run`과 동일한 흐름입니다.

```bash
npm run cppx -- run C:\dev\myapp
npm run cppx -- run C:\dev\myapp --preset release-x64
```

바이너리 경로는 `build/<preset>/<project-name>.exe`입니다.

---

### `test` — 테스트

CTest를 프리셋 기반으로 실행합니다. 실패한 테스트가 있으면 출력 내용을 함께 보여줍니다.

```bash
npm run cppx -- test C:\dev\myapp
npm run cppx -- test C:\dev\myapp --preset release-x64
```

---

### `pack` — 패키징

CPack을 프리셋 기반으로 실행하여 ZIP 형태의 배포 패키지를 생성합니다.

```bash
npm run cppx -- pack C:\dev\myapp
npm run cppx -- pack C:\dev\myapp --preset release-x64
```

---

### `status` — 도구 상태 확인

설치된 도구(cmake, ninja, vcpkg, cxx)의 상태를 확인합니다.

```bash
npm run cppx -- status
```

각 도구에 대해 `ready` 또는 `missing`으로 표시됩니다.

## 프리셋

cppx는 두 가지 빌드 프리셋을 기본 제공합니다.

| 프리셋 | 용도 | 최적화 |
|--------|------|--------|
| `debug-x64` | 개발·디버깅용 | 최적화 없음, 디버그 정보 포함 |
| `release-x64` | 배포용 | 최적화 활성, 디버그 정보 제거 |

`--preset` 옵션을 생략하면 `config.toml`의 `default_preset` 값이 사용되며, 기본값은 `debug-x64`입니다.

::: tip build → run → test → pack의 자연스러운 흐름
Cargo처럼 `run`은 자동으로 `build`를 포함하므로, 개발 중에는 `run` 하나로 빌드와 실행을 동시에 처리할 수 있습니다.
:::
