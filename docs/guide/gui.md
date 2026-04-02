# GUI 사용법

cppx는 CLI뿐 아니라 Electron 기반 GUI도 제공합니다. 코드를 직접 만지지 않고도 프로젝트 설정, 도구 정책, 프리셋, 빌드 실행, 로그 확인을 한 화면에서 처리할 수 있습니다.

## 실행

```bash
npm --prefix packages install
npm --prefix packages run dev
```

앱을 실행하면 좌측 탐색 영역과 우측 작업 영역이 열립니다.

## 작업 영역 구성

GUI는 크게 `탐색`, `빌드`, `로그` 세 뷰로 나뉩니다.

### 탐색 뷰

프로젝트를 선택하고 설정을 편집하는 공간입니다.

- **프로젝트 탐색**
  - 작업 폴더 경로를 직접 입력하거나 `찾아보기` 버튼으로 선택합니다.
- **프로젝트 생성/초기화**
  - 프로젝트 이름을 입력하고 `Init` 버튼으로 `cppx init`을 실행합니다.
- **프로젝트 / 백엔드 설정**
  - `source_file`
  - `cxx_standard`
  - `dependency_backend`
  - 현재 host 기본 backend를 함께 보여 주고, 필요하면 바로 다른 backend로 바꿀 수 있습니다.
  - `default_preset`
  - `target_triplet`
- **도구 정책**
  - `cmake`, `ninja`, `vcpkg`, `conan`, `cxx` 각각에 대해 `mode`와 `version`을 편집합니다.
  - `cxx`는 `preferred_family`를 함께 저장하고, Windows에서 `MSVC`를 선택한 경우에만 `msvc_installation_path`를 편집합니다.
  - macOS 14+에서는 `cxx`를 `managed` 또는 `system`으로 둘 다 설정할 수 있습니다.
  - Ubuntu LTS profiles (22.04, 24.04)에서는 `preferred_family`로 `clang` 또는 `gcc`를 고를 수 있고, `cxx`를 `managed` 또는 `system`으로 둘 다 설정할 수 있습니다.
- **CMake 설정**
  - `compile_definitions`
  - `compile_options`
  - `include_directories`
  - `link_libraries`
  - `config 저장`과 `config 불러오기` 버튼으로 `.cppx/config.toml`과 동기화합니다.
- **의존성 추가**
  - 패키지 이름을 입력하고 `Add`를 누르면 현재 backend에 맞게 의존성을 추가합니다.
  - `dependency_backend = "none"`이면 `Add` 버튼이 비활성화됩니다.
- **프리셋 매트릭스**
  - `name`, `display_name`, `build_type`, `target_triplet`, `runnable`을 GUI에서 편집합니다.
  - 프리셋 추가/삭제와 기본 preset 선택을 함께 처리합니다.

### 빌드 뷰

선택한 preset을 기준으로 Build / Run / Test / Pack을 실행합니다.

- preset 목록은 `.cppx/config.toml`의 `[[presets]]`를 기준으로 표시됩니다.
- `runnable = false`인 preset은 Run 버튼이 비활성화됩니다.
- 우측 `툴체인 상태` 카드에서 CMake, Ninja, vcpkg, conan, C++ 컴파일러의 준비 상태와 해석된 메타데이터를 볼 수 있습니다.
- 현재 선택한 backend 기준으로 필요한 도구 준비 상태를 요약해서 보여 줍니다.
- `install-tools` 버튼과 `툴체인 다시 검사` 버튼으로 도구 설치와 재검사를 분리해 처리합니다.

### 로그 뷰

명령 실행 과정의 로그를 실시간으로 보여 줍니다.

- stdout / stderr / info / success / warn / error 로그가 순서대로 누적됩니다.
- 로그는 최대 5,000개까지 보관됩니다.
- `지우기` 버튼으로 초기화할 수 있습니다.

## 상태 알림

명령이 끝나면 하단에 결과 알림이 표시됩니다.

- 성공: 녹색 토스트
- 실패: 빨간 토스트

긴 작업이 실행 중일 때는 다른 버튼이 비활성화되어 중복 실행을 막습니다.

::: tip GUI도 결국 같은 코어를 호출합니다
GUI 버튼을 눌러도 내부적으로는 CLI와 같은 `CppxService.execute()`를 거칩니다. 설정 해석과 실행 규칙의 기준은 코어 쪽에 있고, GUI는 그 결과를 보여 주는 얇은 레이어입니다.
:::
