# CLI 사용법

cppx CLI는 C++ 프로젝트를 `init -> add -> build -> run -> test -> pack` 흐름으로 다루기 위한 인터페이스입니다.

## 실행 형식

```bash
cd packages
npm run cppx -- <command> [options]
```

## 명령어

### `install-tools`

CMake, Ninja, vcpkg, C++ 컴파일러 상태를 준비합니다.

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

- Windows에서는 관리형 도구를 설치하거나 MSVC를 system 모드로 등록합니다.
- macOS와 Linux에서는 system 도구를 확인하고 manifest를 갱신합니다.
- Conan 실행 파일 자체는 현재 `install-tools`가 설치하지 않습니다.

### `init [workspace]`

프로젝트를 초기화합니다.

```bash
npm run cppx -- init ./myapp --name myapp
npm run cppx -- init ./myapp --name myapp --backend conan
```

옵션:

| 옵션 | 설명 |
|---|---|
| `-n, --name <name>` | 프로젝트 이름 |
| `--backend <vcpkg|conan|none>` | 초기 dependency backend 선택 |

기본 backend와 기본 도구 정책은 호스트 운영체제에 따라 자동 선택되지만, `--backend`로 첫 초기화 시점에 명시적으로 바꿀 수 있습니다.

### `add <dependency> [workspace]`

의존성을 `.cppx/config.toml`에 추가합니다.

```bash
npm run cppx -- add fmt ./myapp
```

backend별 동작:

- `vcpkg`: 패키지 목록에 추가하고 다음 sync 때 `build/.cppx/vcpkg.json`에 반영
- `conan`: 패키지 목록에 추가하고 다음 sync 때 `build/.cppx/conanfile.txt`에 반영
- `none`: 명령이 실패하며, 의존성은 사용자가 직접 관리

### `build [workspace]`

선택한 preset으로 configure + build를 수행합니다.

```bash
npm run cppx -- build ./myapp
npm run cppx -- build ./myapp --preset release-x64
```

옵션:

| 옵션 | 설명 |
|---|---|
| `-p, --preset <preset>` | 프리셋 이름 |

`--preset`을 생략하면 `.cppx/config.toml`의 `default_preset`을 사용합니다.

### `run [workspace]`

먼저 build를 수행한 뒤 바이너리를 실행합니다.

```bash
npm run cppx -- run ./myapp
npm run cppx -- run ./myapp --preset asan-x64
```

`runnable = false`인 preset은 build 전에 즉시 거부됩니다.

### `test [workspace]`

CTest preset을 실행합니다.

```bash
npm run cppx -- test ./myapp
npm run cppx -- test ./myapp --preset release-x64
```

### `pack [workspace]`

CPack preset을 실행합니다.

```bash
npm run cppx -- pack ./myapp
npm run cppx -- pack ./myapp --preset release-x64
```

### `status [workspace]`

도구 설치 상태를 확인합니다.

```bash
npm run cppx -- status
npm run cppx -- status ./myapp
```

가능하면 다음 정보를 함께 보여 줍니다.

- 설치 모드: `managed` 또는 `system`
- 해석된 버전
- 소스 종류: `catalog-archive`, `catalog-github-release`, `system-detected`, `msvc-detected`
- 검증된 SHA-256 일부
- 실행 파일 경로

예시:

```text
cmake: ready (system, 3.30.5, system-detected, /usr/bin/cmake)
```

`status [workspace]`는 workspace에 `.cppx/config.toml`이 있으면 backend, schema, 다음 단계 힌트도 함께 보여 줍니다.

### `doctor [workspace]`

현재 호스트와 workspace를 기준으로 blocker, warning, 다음 단계 안내를 보여 줍니다.

```bash
npm run cppx -- doctor
npm run cppx -- doctor ./myapp
```

`doctor`는 다음 항목을 점검합니다.

- 호스트 플랫폼과 현재 compiler family
- `cmake`, `ninja`, `ctest`, `cpack`, C++ 컴파일러 상태
- 활성 dependency backend 준비 상태
- `conan` backend일 때 Conan 실행 파일 존재 여부
- `.cppx/config.toml`, schema 상태, `build/.cppx` 생성물 루트 상태
- `dependency_backend = "none"`일 때 왜 `cppx add`가 비활성화되는지

출력은 `BLOCKER`, `WARN`, `OK`로 구분됩니다. blocker가 하나라도 있으면 종료 코드는 `1`, blocker가 없으면 `0`입니다.

## 프리셋 동작

프리셋은 `[[presets]]` 배열로 정의됩니다.

- configure, build, test, package preset이 같은 이름으로 생성됩니다.
- VSCode tasks도 같은 preset 목록을 기준으로 생성됩니다.
- `runnable = false`인 preset은 `launch.json`, run task, `cppx run`에서 제외됩니다.
- 프리셋이 하나도 없으면 기본적으로 `debug-<host-arch>`, `release-<host-arch>`를 생성합니다.

## backend 동작

- `vcpkg`: `build/.cppx/vcpkg.json` 생성, vcpkg toolchain 사용
- `conan`: `build/.cppx/conanfile.txt` 생성, configure 전에 `conan install` 실행
- `none`: backend manifest 없음, `cppx add` 비활성화

프로젝트를 `init`으로 만들 때 기본 backend는 Windows에서 `vcpkg`, macOS와 Linux에서 `none`입니다.
`none` backend에서 의존성이 필요해지면 `dependency_backend`를 `conan` 또는 `vcpkg`로 바꾸고 `doctor`를 다시 실행하는 편이 안전합니다.
