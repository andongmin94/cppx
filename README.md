# cppx

Windows에서 C++ 개발을 Cargo처럼 다룰 수 있게 해주는 Electron 앱 + CLI입니다.

## 주요 기능

- React + shadcn/ui 기반 Electron GUI
- 외부 명령 실행 오케스트레이션(`child_process.spawn`)
- 도구 설치 흐름(`cmake`, `ninja`, `vcpkg`, 로컬 `clang++` 툴체인)
- 프로젝트 작업 흐름: `init`, `add`, `build`, `run`, `test`, `pack`
- 단일 관리 루트: `%LOCALAPPDATA%/cppx`
- 단일 설정 원본: `.cppx/config.toml`
- 생성 파일은 `.cppx` 아래에서 관리:
  - `CMakeLists.txt`
  - `CMakePresets.json`
  - `vcpkg.json`
- VSCode `.vscode/tasks.json`, `.vscode/launch.json` 생성
- UI 실시간 로그 패널 제공
- GUI에서 `.cppx/config.toml`의 `[cmake]` 옵션 불러오기/저장 지원

## 빠른 시작

```bash
npm install
npm run dev
```

## 문제 해결

Electron이 Node 모드(`ELECTRON_RUN_AS_NODE=1`)로 시작되면 앱이 부팅되지 않고
`No electron app entry file found` 또는 `app.whenReady is undefined` 같은 오류가 날 수 있습니다.
이 프로젝트의 `dev`, `preview` 스크립트는 해당 변수를 자동으로 비웁니다.

## CLI 사용법

```bash
# %LOCALAPPDATA%/cppx/tools 아래 도구 설치/업데이트
npm run cppx -- install-tools

# 새 워크스페이스 초기화
npm run cppx -- init C:\dev\myapp --name myapp

# 의존성 추가 (.cppx/config.toml 반영)
npm run cppx -- add fmt C:\dev\myapp

# 프리셋으로 빌드 (CMake + Ninja)
npm run cppx -- build C:\dev\myapp --preset debug-x64

# 실행, 테스트, 패키징
# run은 먼저 증분 build를 수행합니다 (cargo run 스타일)
npm run cppx -- run C:\dev\myapp --preset debug-x64
npm run cppx -- test C:\dev\myapp --preset debug-x64
npm run cppx -- pack C:\dev\myapp --preset debug-x64
```

## config.toml의 CMake 설정

`[cmake]` 섹션으로 생성되는 `CMakeLists.txt`의 타깃 옵션을 제어할 수 있습니다.

```toml
[cmake]
compile_definitions = ["USE_SSL", "APP_VERSION=1"]
compile_options = ["-Wall", "-Wextra"]
include_directories = ["include", "third_party/fmt/include"]
link_libraries = ["ws2_32", "bcrypt"]
```

- `compile_definitions` -> `target_compile_definitions(... PRIVATE ...)`
- `compile_options` -> `target_compile_options(... PRIVATE ...)`
- `include_directories` -> `target_include_directories(... PRIVATE ...)`
- `link_libraries` -> `target_link_libraries(... PRIVATE ...)`

GUI에서는 **CMake 설정 카드**의 `config 불러오기`/`config 저장`으로 같은 값을 편집할 수 있습니다.

## 프로젝트 구조

```txt
.
├─ electron.vite.config.ts
├─ package.json
├─ tailwind.config.ts
├─ postcss.config.cjs
├─ src
│  ├─ shared
│  │  ├─ channels.ts
│  │  └─ contracts.ts
│  ├─ main
│  │  ├─ index.ts
│  │  ├─ main.ts
│  │  ├─ ipc.ts
│  │  ├─ cli.ts
│  │  └─ cppx
│  │     ├─ command-runner.ts
│  │     ├─ errors.ts
│  │     ├─ fs-utils.ts
│  │     ├─ installers.ts
│  │     ├─ logger.ts
│  │     ├─ paths.ts
│  │     ├─ project.ts
│  │     ├─ service.ts
│  │     └─ types.ts
│  ├─ preload
│  │  └─ index.ts
│  └─ renderer
│     ├─ index.html
│     └─ src
│        ├─ App.tsx
│        ├─ main.tsx
│        ├─ index.css
│        ├─ vite-env.d.ts
│        ├─ lib
│        │  └─ utils.ts
│        └─ components
│           └─ ui
│              ├─ badge.tsx
│              ├─ button.tsx
│              ├─ card.tsx
│              ├─ input.tsx
│              ├─ label.tsx
│              ├─ scroll-area.tsx
│              ├─ select.tsx
│              └─ separator.tsx
└─ tsconfig.json
```

## CMake + Ninja 실행 예시

`src/main/cppx/project.ts`에서 `spawn`으로 아래 순서로 실행합니다.

1. `cmake --preset debug-x64`
2. `cmake --build --preset debug-x64`

`.cppx/CMakePresets.json`에는 아래 항목이 반영됩니다.

- `generator: Ninja`
- `CMAKE_MAKE_PROGRAM`: 관리형 Ninja 바이너리 경로
- `CMAKE_TOOLCHAIN_FILE`: `%LOCALAPPDATA%/cppx/tools/vcpkg/scripts/buildsystems/vcpkg.cmake`
- `CMAKE_CXX_COMPILER`: 관리형 로컬 `clang++.exe`

## 오류 처리와 사용자 피드백

- 모든 오케스트레이션은 `CppxService.execute()`에서 처리
- 실패 시 구조화된 결과 반환:
  - `ok: false`
  - `code: 1`
  - 사용자 표시용 `message`
- stdout/stderr 로그를 IPC로 실시간 스트리밍:
  - 채널: `cppx:log`
  - UI 로그 패널에 즉시 반영
- Busy 상태에서 동시 명령 실행 방지
