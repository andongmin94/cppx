# 마이그레이션 가이드

이 문서는 예전 cppx 프로젝트를 현재의 `schema_version = 2` 기반 설정으로 옮길 때 확인할 항목을 정리합니다.

## 누가 읽어야 하나요?

다음 중 하나에 해당하면 이 문서를 보는 편이 좋습니다.

- `.cppx/project.json`을 기준으로 프로젝트를 관리하던 사용자
- 루트 `vcpkg.json`과 수동 CMake 설정을 함께 유지하던 사용자
- 고정된 `debug/release` 두 프리셋만 전제로 쓰던 사용자
- Windows 관리형 흐름 외에 macOS/Linux system 도구 흐름이나 `conan` / `none` backend를 도입하려는 사용자

## 지금도 유지되는 것

- `init -> add -> build -> run -> test -> pack` 중심의 CLI 흐름은 그대로 유지됩니다
- Windows의 기본 `vcpkg` + 관리형 도구 흐름은 계속 기본값으로 유지됩니다
- 기존 `.cppx/project.json`과 루트 `vcpkg.json`은 여전히 자동 마이그레이션 대상입니다
- GUI와 CLI는 같은 코어 서비스를 사용하므로 결과 해석 규칙은 동일합니다

## 바뀐 핵심 개념

### 1. 설정 원본은 `.cppx/config.toml` 하나입니다

이제 사람이 직접 관리해야 하는 원본은 `.cppx/config.toml`입니다.

다음 파일은 생성물로 취급하는 것이 맞습니다.

- `.cppx/CMakeLists.txt`
- `.cppx/CMakePresets.json`
- `.cppx/vcpkg.json` 또는 `.cppx/conanfile.txt`
- `.vscode/tasks.json`
- `.vscode/launch.json`

생성물을 직접 수정하기보다 설정 파일이나 GUI에서 값을 바꾸는 쪽이 안정적입니다.

### 2. 의존성 방식은 backend로 고릅니다

`[project]`의 `dependency_backend`는 다음 중 하나를 사용합니다.

- `vcpkg` — `.cppx/vcpkg.json` 생성
- `conan` — `.cppx/conanfile.txt` 생성, configure 전에 `conan install` 실행
- `none` — backend manifest 없이 plain CMake처럼 동작

주의할 점:

- `conan`은 시스템에 Conan 2.x가 미리 설치되어 있어야 합니다
- `none`에서는 `cppx add`가 거부됩니다

### 3. 도구 설치는 `[tools.*]` 정책으로 해석합니다

도구별로 `managed` 또는 `system` 모드를 선택할 수 있습니다.

- Windows 기본값: `cmake`, `ninja`, `vcpkg`, MinGW는 `managed`, MSVC는 `system`
- macOS/Linux 기본값: 대부분 `system`

현재는 macOS/Linux용 관리형 tool catalog가 아직 없으므로, 해당 호스트에서는 system 도구 흐름을 전제로 생각하는 편이 맞습니다.

### 4. 프리셋은 `[[presets]]` 배열로 선언합니다

예전처럼 고정된 debug/release만 가정하지 않고, 여러 프리셋을 데이터로 선언할 수 있습니다.

각 프리셋은 최소한 다음 정보를 가질 수 있습니다.

- `name`
- `display_name`
- `build_type`
- `target_triplet`
- `runnable`

`default_preset`은 `--preset`을 생략했을 때 사용할 프리셋을 지정합니다.

`runnable = false`인 프리셋은 `cppx run`, VSCode launch, GUI Run 버튼에서 제외되거나 거부됩니다.

## 추천 전환 순서

1. 현재 프로젝트를 열고 `.cppx/config.toml`이 생성되거나 갱신되게 합니다
2. `[project]`, `[compiler]`, `[dependencies]`, `[tools.*]`, `[[presets]]`가 현재 기대와 맞는지 확인합니다
3. 직접 편집하던 생성물의 변경 내용을 가능한 한 `config.toml` 쪽 설정으로 옮깁니다
4. 필요하면 GUI의 `프로젝트 / 백엔드 설정`, `도구 정책`, `프리셋 매트릭스`, `CMake 설정` 카드에서 같은 값을 수정합니다
5. `build`, `run`, `test`, `pack`을 다시 실행해 생성물과 실행 흐름이 기대대로 나오는지 확인합니다

## 자주 바뀌는 지점

### 레거시 `project.json` 사용자

- 핵심 설정은 `.cppx/config.toml`으로 모입니다
- 프리셋 기본값은 이제 `default_preset`으로 관리합니다
- 프리셋 매트릭스는 `[[presets]]`로 직접 선언할 수 있습니다

### 루트 `vcpkg.json` 사용자

- `vcpkg` backend를 쓰면 의존성 원본은 `[dependencies].packages`입니다
- 생성된 `.cppx/vcpkg.json`은 동기화 결과물이므로 직접 편집하지 않는 편이 맞습니다

### Windows 전용 흐름 사용자

- 기존 기본 흐름은 유지됩니다
- 다만 이제 같은 설정 파일로 `conan` / `none`, system/managed 도구 정책, 호스트별 기본 프리셋까지 함께 표현할 수 있습니다

## 문제를 줄이는 팁

- `default_preset`이 실제 프리셋 이름과 어긋나면 cppx가 첫 번째 프리셋으로 보정합니다
- macOS/Linux에서는 `cmake`, `ninja`, `clang++` 또는 `g++`가 PATH에 있어야 합니다
- `conan` backend를 선택했는데 `conan` 명령이 없으면 configure 전에 실패합니다
- 생성물을 직접 편집한 상태라면, 우선 설정 파일에 같은 의미가 반영되는지 먼저 확인한 뒤 생성물을 다시 만들면 충돌을 줄일 수 있습니다

## 관련 문서

- [설정 (`config.toml`)](./config.md)
- [도구 설치](./install.md)
- [CLI 사용법](./cli.md)
- [GUI 사용법](./gui.md)
