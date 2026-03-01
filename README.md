# cppx

Windows에서 C++ 개발을 **Cargo처럼** 다룰 수 있게 해 주는 Electron 앱 + CLI입니다.

CMake 설정을 직접 작성하고, 빌드 스크립트를 만들고, 패키지 매니저를 연동하는 반복 작업 — cppx가 대신 처리합니다. `init → add → build → run → test → pack`, 한 줄짜리 명령어로 C++ 프로젝트의 전체 워크플로를 관리할 수 있습니다.

## 주요 기능

- **Cargo 스타일 CLI** — `init`, `add`, `build`, `run`, `test`, `pack` 명령어로 프로젝트를 빠르게 관리합니다
- **원클릭 도구 설치** — CMake, Ninja, vcpkg, C++ 컴파일러(llvm-mingw 또는 MSVC)를 `%LOCALAPPDATA%/cppx/`에 자동 설치합니다. 시스템 환경을 오염시키지 않습니다
- **단일 설정 원본** — `.cppx/config.toml` 하나만 관리하면 `CMakeLists.txt`, `CMakePresets.json`, `vcpkg.json`이 매 빌드마다 자동 생성됩니다
- **Electron GUI** — 프로젝트 탐색, 빌드, 실시간 로그 확인까지 마우스 클릭으로 수행할 수 있습니다
- **VSCode 통합** — 프로젝트 초기화 시 `.vscode/tasks.json`과 `launch.json`이 자동 생성됩니다

## 빠른 시작

```bash
cd packages
npm install
npm run dev          # GUI 실행
```

또는 CLI로 바로 시작할 수도 있습니다.

```bash
npm run cppx -- install-tools                        # 도구 설치
npm run cppx -- init C:\dev\myapp --name myapp       # 프로젝트 생성
npm run cppx -- run C:\dev\myapp                     # 빌드 & 실행
```

## 기술 스택

| 영역 | 사용 기술 |
|------|-----------|
| 런타임 | Electron (electron-vite) |
| 렌더러 | React 19, TypeScript, Tailwind CSS |
| UI 컴포넌트 | shadcn/ui (Radix UI 기반) |
| C++ 도구 | CMake 3.30, Ninja 1.12, vcpkg, llvm-mingw / MSVC |
| 빌드 시스템 | CMake + Ninja (프리셋 기반) |
| 설정 포맷 | TOML (자체 파서) |

## CLI 명령어 요약

| 명령어 | 설명 |
|--------|------|
| `install-tools` | CMake, Ninja, vcpkg, C++ 컴파일러를 설치합니다 |
| `init <경로>` | 새 C++ 프로젝트를 생성합니다 |
| `add <패키지> <경로>` | vcpkg 의존성을 추가합니다 |
| `build <경로>` | CMake configure + build를 수행합니다 |
| `run <경로>` | 빌드 후 바이너리를 실행합니다 (cargo run 스타일) |
| `test <경로>` | CTest를 실행합니다 |
| `pack <경로>` | CPack으로 배포 패키지를 생성합니다 |
| `status` | 도구 설치 상태를 확인합니다 |

## config.toml 예시

```toml
[project]
name = "myapp"
default_preset = "debug-x64"
source_file = "src/main.cpp"
cxx_standard = 20

[dependencies]
packages = ["fmt", "boost-asio"]

[cmake]
compile_definitions = ["USE_SSL", "APP_VERSION=1"]
compile_options = ["-Wall", "-Wextra"]
include_directories = ["include", "third_party/fmt/include"]
link_libraries = ["ws2_32", "bcrypt"]
```

`[cmake]` 섹션의 각 항목은 CMake 타겟 명령과 1:1로 대응됩니다.

- `compile_definitions` → `target_compile_definitions(... PRIVATE ...)`
- `compile_options` → `target_compile_options(... PRIVATE ...)`
- `include_directories` → `target_include_directories(... PRIVATE ...)`
- `link_libraries` → `target_link_libraries(... PRIVATE ...)`

GUI에서는 **CMake 설정 카드**의 `config 불러오기` / `config 저장` 버튼으로 같은 값을 편집할 수 있습니다.

## 프로젝트 구조

```text
cppx/
├─ docs/                      # VitePress 문서
└─ packages/                  # 앱 코드
   ├─ src/
   │   ├─ main/               # Electron 메인 프로세스
   │   │   ├─ cli.ts          # CLI 진입점
   │   │   ├─ ipc.ts          # IPC 핸들러
   │   │   └─ cppx/           # 코어 로직 (service, project, installers 등)
   │   ├─ preload/            # contextBridge 프리로드
   │   ├─ renderer/           # React UI (App.tsx, shadcn 컴포넌트)
   │   └─ shared/             # main ↔ renderer 공유 타입
   ├─ electron.vite.config.ts
   └─ package.json
```

## 문제 해결

Electron이 Node 모드(`ELECTRON_RUN_AS_NODE=1`)로 시작되면 `No electron app entry file found` 또는 `app.whenReady is undefined` 같은 오류가 발생할 수 있습니다. 이 프로젝트의 `dev`, `preview` 스크립트는 해당 환경변수를 자동으로 해제하므로 정상 실행됩니다.

## 문서 & 링크

- 문서 사이트: https://cppx.andongmin.com
- GitHub: https://github.com/andongmin94/cppx

## 라이선스

MIT
