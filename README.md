<div align="center">

<a href="https://cppx.andongmin.com">
<img src="https://cppx.andongmin.com/logo.svg" alt="logo" height="200" />
</a>

</div>

# cppx

Windows, macOS, Linux에서 C++ 개발을 **Cargo처럼** 다룰 수 있게 해 주는 Electron 앱 + CLI입니다.

CMake 설정을 직접 작성하고, 빌드 스크립트를 만들고, 패키지 매니저를 연동하는 반복 작업 — cppx가 대신 처리합니다. `init → add → build → run → test → pack`, 한 줄짜리 명령어로 C++ 프로젝트의 전체 워크플로를 관리할 수 있습니다.

## 주요 기능

- **Cargo 스타일 CLI** — `init`, `add`, `build`, `run`, `test`, `pack` 명령어로 프로젝트를 빠르게 관리합니다
- **호스트별 도구 정책** — Windows에서는 관리형 CMake/Ninja/vcpkg/컴파일러 설치를 지원하고, macOS/Linux에서는 시스템 도구 기반 네이티브 워크플로를 지원합니다
- **다운로드 무결성 검증** — 관리형 아카이브 도구는 SHA-256을 확인한 뒤에만 압축을 풉니다
- **단일 설정 원본** — `.cppx/config.toml` 하나만 관리하면 tool-owned 생성물은 `build/.cppx/` 아래에 다시 생성됩니다
- **Electron GUI** — 프로젝트 탐색, backend/tool policy/preset 편집, 빌드, 실시간 로그 확인까지 마우스 클릭으로 수행할 수 있습니다
- **VSCode 통합** — `.vscode/tasks.json`과 `launch.json`에서 `cppx:`가 붙은 관리 항목만 다시 쓰고, 나머지 사용자 항목은 보존합니다

## 호스트 지원

- **Windows** — 기본 backend는 `vcpkg`이고, CMake/Ninja/vcpkg와 MinGW 컴파일러를 관리형으로 설치할 수 있습니다. MSVC는 system 모드로 감지합니다
- **macOS / Linux** — 기본 backend는 `none`이고, `cmake`, `ninja`, 시스템 C++ 컴파일러를 그대로 사용하는 네이티브 호스트 워크플로를 지원합니다
- **공통 제한** — Conan은 별도 설치가 필요하고, macOS/Linux용 관리형 도구 catalog는 아직 제공하지 않습니다

## 빠른 시작

```bash
cd packages
npm install
npm run test         # 테스트 실행
npm run smoke:native # 시스템 CMake/Ninja/컴파일러가 있을 때 네이티브 스모크
npm run dev          # GUI 실행
```

또는 CLI로 바로 시작할 수도 있습니다.

```bash
npm run cppx -- install-tools --compiler mingw  # Windows 관리형 도구 설치
npm run cppx -- install-tools --compiler msvc   # Windows에서 MSVC 정책 사용
npm run cppx -- install-tools                   # macOS/Linux에서는 시스템 도구 상태 확인
npm run cppx -- init ./myapp --name myapp --backend none   # backend를 명시해 프로젝트 생성
npm run cppx -- doctor ./myapp                  # 막히는 지점과 다음 단계 진단
npm run cppx -- run ./myapp                     # 빌드 & 실행
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
| `install-tools` | CMake, Ninja, vcpkg, C++ 컴파일러를 정책에 따라 설치하거나 시스템 도구를 등록합니다 |
| `init <경로>` | 새 C++ 프로젝트를 생성합니다 |
| `add <패키지> <경로>` | 현재 backend 설정에 맞춰 의존성 목록을 추가합니다 |
| `build <경로>` | CMake configure + build를 수행합니다 |
| `run <경로>` | 빌드 후 바이너리를 실행합니다 (cargo run 스타일) |
| `test <경로>` | CTest를 실행합니다 |
| `pack <경로>` | CPack으로 배포 패키지를 생성합니다 |
| `status` | 도구 설치 상태와 해석된 메타데이터를 확인합니다 |
| `doctor [경로]` | blocking issue, warning, 다음 단계 안내를 한 번에 보여 줍니다 |

## config.toml 예시

```toml
[project]
schema_version = 3
name = "myapp"
target_name = "myapp"
default_preset = "debug-x64"
source_file = "src/main.cpp"
cxx_standard = 20
target_triplet = "x64-mingw-dynamic"
dependency_backend = "vcpkg"

[package]
version = "0.1.0"
vendor = "myapp"
generators = ["ZIP"]
output_dir = "dist"

[compiler]
preferred_family = "mingw"

[dependencies]
packages = ["fmt", "boost-asio"]

[cmake]
compile_definitions = ["USE_SSL", "APP_VERSION=1"]
compile_options = ["-Wall", "-Wextra"]
include_directories = ["include", "third_party/fmt/include"]
link_libraries = ["ws2_32", "bcrypt"]

[tools.cmake]
mode = "managed"
version = "default"

[tools.ninja]
mode = "managed"
version = "default"

[tools.vcpkg]
mode = "managed"
version = "default"

[tools.cxx]
mode = "managed"
version = "latest"
preferred_family = "mingw"

[[presets]]
name = "debug-x64"
display_name = "Debug x64"
build_type = "Debug"
target_triplet = "x64-mingw-dynamic"
runnable = true

[[presets]]
name = "release-x64"
display_name = "Release x64"
build_type = "Release"
target_triplet = "x64-mingw-dynamic"
runnable = true
```

`[cmake]` 섹션의 각 항목은 CMake 타겟 명령과 1:1로 대응됩니다.

- `compile_definitions` → `target_compile_definitions(... PRIVATE ...)`
- `compile_options` → `target_compile_options(... PRIVATE ...)`
- `include_directories` → `target_include_directories(... PRIVATE ...)`
- `link_libraries` → `target_link_libraries(... PRIVATE ...)`

GUI에서는 **CMake 설정 카드**의 `config 불러오기` / `config 저장` 버튼으로 같은 값을 편집할 수 있습니다.

현재는 `schema_version`, `target_name`, `package`, `compiler`, `tools`, `presets`, `dependency_backend`가 실제 생성기와 연결됩니다. `[[presets]]`는 configure/build/test/pack 프리셋과 VSCode 생성물에 반영되고, `dependency_backend`는 `vcpkg`, `conan`, `none`을 지원합니다.

새 프로젝트의 기본값은 호스트에 따라 달라집니다. Windows는 `dependency_backend = "vcpkg"`와 관리형 도구 정책을 기본으로 사용하고, macOS/Linux는 `dependency_backend = "none"`과 system 도구 정책을 기본으로 사용합니다.

`dependency_backend = "conan"`을 사용할 때는 `conan` 명령을 시스템에 별도로 설치해야 합니다. `install-tools`는 현재 Conan 자체를 설치하지 않습니다.

`init`은 `--backend <vcpkg|conan|none>`를 지원하므로 처음부터 의존성 방식을 명시할 수 있습니다.
`install-tools`는 `--compiler <mingw|msvc>`와 `--msvc-installation-path <path>`를 지원합니다.
`status [workspace]`는 가능한 경우 `managed/system`, 해석된 버전, 소스 종류, 검증된 SHA-256 일부, 실행 파일 경로와 workspace 힌트를 함께 표시합니다.
`doctor [workspace]`는 blocker와 warning을 구분해서 보여 주고, 특히 `dependency_backend = "none"`에서 왜 `cppx add`가 비활성화되는지 설명합니다.

GitHub Actions에는 `Native CI`와 별도 `Release Artifacts` workflow가 포함되어 있습니다. 태그나 수동 실행으로 OS별 빌드 산출물을 만들 수 있습니다.

## 마이그레이션 요약

- 기존 `.cppx/project.json`과 루트 `vcpkg.json`은 계속 읽히며, 현재 버전에서는 `.cppx/config.toml` v3 형식으로 자동 마이그레이션됩니다
- 이제 설정의 중심은 `.cppx/config.toml`입니다. `build/.cppx/CMakeLists.txt`, `build/.cppx/CMakePresets.json`, backend manifest, `.vscode/tasks.json`, `.vscode/launch.json`은 모두 생성물로 취급하는 것이 맞습니다
- 고정된 `debug/release` 쌍만 쓰던 프로젝트도 계속 동작하지만, 이제는 `[[presets]]`와 `default_preset`으로 프리셋 매트릭스를 직접 선언할 수 있습니다
- 의존성 방식은 `dependency_backend = "vcpkg" | "conan" | "none"`로 선택하고, 도구 설치 방식은 `[tools.*]`의 `managed/system` 정책으로 제어합니다
- 자세한 전환 절차는 [docs/guide/migration.md](docs/guide/migration.md)에 정리했습니다

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

macOS/Linux에서 `cmake`, `ninja`, `clang++` 또는 `g++`가 PATH에 없다면 `build`, `run`, `test`, `pack`, `smoke:native`가 실패합니다. 이 경우 시스템 패키지 매니저로 먼저 설치해야 합니다.

프로젝트 상태가 애매하거나 `add`가 왜 막히는지 모르겠다면 `npm run cppx -- doctor <workspace>`를 먼저 실행하는 편이 가장 빠릅니다.

## 문서 & 링크

- 문서 사이트: https://cppx.andongmin.com
- GitHub: https://github.com/andongmin94/cppx

## 라이선스

MIT
