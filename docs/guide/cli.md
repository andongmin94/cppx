# CLI 사용법

`cppx` CLI는 C++ 프로젝트를 `init -> add -> build -> run -> test -> pack` 흐름으로 다루기 위한 인터페이스입니다.

## 실행 형식

```bash
cd packages
npm run cppx -- <command> [options]
```

## 명령어

### `install-tools`

호스트 정책에 따라 CMake, Ninja, vcpkg, conan, C++ 컴파일러를 준비합니다.

```bash
npm run cppx -- install-tools
npm run cppx -- install-tools --compiler mingw
npm run cppx -- install-tools --compiler msvc --msvc-installation-path "C:\Program Files\Microsoft Visual Studio\2022\BuildTools"
```

옵션:

| 옵션 | 설명 |
|---|---|
| `--compiler <mingw|msvc>` | 컴파일러 계열 선택 |
| `--msvc-installation-path <path>` | 특정 MSVC 설치 경로 우선 사용 |

- Windows에서는 archive 기반 managed 도구를 설치하고, MSVC는 system 감지로 등록합니다.
- macOS 14+에서는 Homebrew 기반 managed 도구와 archive 기반 `vcpkg` 경로를 사용합니다.
- Linux에서는 현재 system 도구를 확인하고 manifest를 갱신합니다.

### `init [workspace]`

새 프로젝트를 초기화합니다.

```bash
npm run cppx -- init ./myapp --name myapp
npm run cppx -- init ./myapp --name myapp --backend conan
```

옵션:

| 옵션 | 설명 |
|---|---|
| `-n, --name <name>` | 프로젝트 이름 |
| `--backend <vcpkg|conan|none>` | 초기 dependency backend 선택 |

### `add <dependency> [workspace]`

의존성을 `.cppx/config.toml`에 추가합니다.

```bash
npm run cppx -- add fmt ./myapp
```

- `vcpkg`: 다음 sync 때 `build/.cppx/vcpkg.json`에 반영됩니다.
- `conan`: 다음 sync 때 `build/.cppx/conanfile.txt`에 반영됩니다.
- `none`: 명령이 실패합니다.

### `build [workspace]`

선택한 preset으로 configure + build를 실행합니다.

```bash
npm run cppx -- build ./myapp
npm run cppx -- build ./myapp --preset release-x64
```

### `run [workspace]`

먼저 build를 실행한 뒤 바이너리를 실행합니다.

```bash
npm run cppx -- run ./myapp
```

### `test [workspace]`

CTest preset을 실행합니다.

```bash
npm run cppx -- test ./myapp
```

### `pack [workspace]`

CPack preset을 실행합니다.

```bash
npm run cppx -- pack ./myapp
```

### `status [workspace]`

도구 설치 상태와 provenance를 확인합니다.

```bash
npm run cppx -- status
npm run cppx -- status ./myapp
```

가능하면 다음 정보를 함께 보여 줍니다.

- `managed` / `system`
- provider (`archive`, `homebrew`, `system`, `msvc`)
- ownership (`cppx-owned`, `external`)
- 해석된 버전
- 실행 파일 경로

### `doctor [workspace]`

현재 host와 workspace 기준으로 blocker, warning, next steps를 보여 줍니다.

```bash
npm run cppx -- doctor
npm run cppx -- doctor ./myapp
```

`doctor`는 다음을 점검합니다.

- host 지원 수준과 provider 경로
- `cmake`, `ninja`, `ctest`, `cpack`, `cxx`
- 활성 backend에 필요한 `vcpkg` 또는 `conan`
- `.cppx/config.toml`과 `build/.cppx`

blocker가 하나라도 있으면 종료 코드는 `1`입니다.

## backend 동작

- `vcpkg`: `build/.cppx/vcpkg.json` 생성, `vcpkg.cmake` 사용
- `conan`: `build/.cppx/conanfile.txt` 생성, configure 전에 `conan install` 실행
- `none`: backend manifest 없음, `cppx add` 비활성화

## preset 동작

- `[[presets]]` 배열을 기준으로 configure/build/test/pack preset을 생성합니다.
- `runnable = false`인 preset은 `run` 대상에서 제외됩니다.
- preset이 없으면 기본으로 `debug-<host-arch>`, `release-<host-arch>`를 만듭니다.
