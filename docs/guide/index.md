# cppx 시작하기

C++ 프로젝트를 시작할 때마다 CMake 설정을 만들고, 빌드 스크립트를 작성하고, 패키지 매니저를 연동하는 과정이 번거롭게 느껴지신 적이 있을 것입니다.

cppx는 바로 그 문제를 해결합니다. Rust의 Cargo처럼 **한 줄의 명령어로 초기화부터 빌드·실행·테스트·패키징**까지 모두 처리할 수 있는 Windows용 C++ 워크플로 도구입니다.

## 📖 가이드 목차

- [도구 설치](./install.md) — CMake, Ninja, vcpkg, C++ 컴파일러를 자동으로 설치합니다
- [CLI 사용법](./cli.md) — 프로젝트 초기화부터 빌드·실행·패키징까지 CLI 명령어를 안내합니다
- [설정 (config.toml)](./config.md) — `.cppx/config.toml`로 프로젝트를 세밀하게 제어합니다
- [GUI 사용법](./gui.md) — Electron 기반 GUI의 각 탭과 기능을 설명합니다

## 어떤 도구인가요?

cppx는 크게 두 가지 인터페이스를 제공합니다.

- **CLI** — 터미널에서 `cppx init`, `cppx build` 같은 명령어로 빠르게 조작합니다
- **GUI** — Electron 앱을 열어서 버튼 클릭으로 같은 작업을 수행합니다

어떤 인터페이스를 사용하든 내부적으로는 동일한 `CppxService`를 거치기 때문에, CLI와 GUI의 결과가 항상 일치합니다.

## 빠른 시작

### 1단계: 도구 설치

cppx가 관리하는 C++ 툴체인(CMake, Ninja, vcpkg, 컴파일러)을 설치합니다. 모든 도구는 `%LOCALAPPDATA%/cppx/` 하위에 격리되어 시스템 환경을 오염시키지 않습니다.

```bash
npm run cppx -- install-tools
```

### 2단계: 프로젝트 초기화

원하는 경로에 새로운 C++ 프로젝트를 생성합니다.

```bash
npm run cppx -- init C:\dev\myapp --name myapp
```

이 명령 하나로 다음 파일들이 자동 생성됩니다.

| 파일 | 역할 |
|------|------|
| `src/main.cpp` | Hello World 시작 코드 |
| `.cppx/config.toml` | 프로젝트 설정 원본 |
| `.cppx/CMakeLists.txt` | CMake 빌드 스크립트 (자동 생성) |
| `.cppx/CMakePresets.json` | 빌드 프리셋 정의 |
| `.cppx/vcpkg.json` | vcpkg 의존성 매니페스트 |
| `.vscode/tasks.json` | VSCode 빌드 태스크 |
| `.vscode/launch.json` | VSCode 디버거 설정 |

### 3단계: 빌드 & 실행

```bash
npm run cppx -- build C:\dev\myapp
npm run cppx -- run C:\dev\myapp
```

`run` 명령은 `cargo run`처럼 빌드를 먼저 수행한 뒤 바이너리를 실행합니다.

::: tip config.toml이 모든 것의 시작점입니다
`.cppx/config.toml` 파일 하나만 수정하면, cppx가 `CMakeLists.txt`, `CMakePresets.json`, `vcpkg.json`을 매 빌드 시 자동으로 다시 생성합니다. 생성된 파일을 직접 편집할 필요가 없습니다.
:::

## GUI로 시작하기

CLI 대신 GUI를 선호한다면 아래 명령으로 Electron 앱을 실행합니다.

```bash
npm run dev
```

GUI에서는 프로젝트 폴더 선택, 빌드/실행, 도구 설치, 실시간 로그 확인까지 모두 마우스 클릭으로 처리할 수 있습니다.

## 기술 스택

| 영역 | 사용 기술 |
|------|-----------|
| 런타임 | Electron (electron-vite) |
| 렌더러 | React 19, TypeScript, Tailwind CSS |
| UI 컴포넌트 | shadcn/ui (Radix UI 기반) |
| C++ 도구 | CMake 3.30, Ninja 1.12, vcpkg, llvm-mingw / MSVC |
| 빌드 시스템 | CMake + Ninja (프리셋 기반) |
| 설정 포맷 | TOML (자체 파서) |

## 프로젝트 구조

```text
cppx/
├─ docs/                # VitePress 문서
└─ packages/            # 앱 코드
   ├─ src/
   │   ├─ main/         # Electron 메인 프로세스 + cppx 코어 로직
   │   ├─ preload/      # contextBridge 프리로드
   │   ├─ renderer/     # React UI
   │   └─ shared/       # main ↔ renderer 공유 타입
   └─ package.json
```
