# GUI 사용법

cppx는 CLI뿐 아니라 Electron 기반 GUI도 제공합니다. 코드를 직접 치지 않고도 프로젝트 관리, backend/tool policy/preset 편집, 빌드 실행, 로그 확인을 모두 할 수 있습니다.

## GUI 실행하기

```bash
cd packages
npm install
npm run dev
```

실행하면 Electron 앱 창이 열리며, 상단에 현재 작업 폴더, 기본 프리셋, 의존성 백엔드가 표시됩니다.

## 화면 구성

GUI는 좌측 탭 버튼과 우측 작업 영역으로 구성되어 있습니다.

- **탐색** — 프로젝트 경로, 설정 편집, 의존성 추가, 프리셋 매트릭스를 다룹니다
- **빌드** — Build / Run / Test / Pack과 툴체인 상태를 다룹니다
- **로그** — 실행 로그를 실시간으로 확인합니다

상단 헤더에는 현재 작업 폴더, 기본 프리셋, 의존성 백엔드, 현재 탭이 함께 표시됩니다.

## 탐색 탭

프로젝트를 탐색하고 `.cppx/config.toml`에 대응하는 주요 설정을 편집하는 공간입니다.

- **작업 폴더 선택** — 경로를 직접 입력하거나 찾아보기 버튼으로 폴더를 선택합니다
- **프로젝트 초기화** — 프로젝트 이름을 입력하고 **Init** 버튼을 누르면 `cppx init`이 실행됩니다
- **프로젝트 / 백엔드 설정** — `source_file`, `cxx_standard`, `dependency_backend`, `default_preset`, 기본 `target_triplet`을 편집합니다
- **도구 정책** — `cmake`, `ninja`, `vcpkg`, `cxx`의 `mode`, `version`을 조정합니다. `cxx`는 `preferred_family`, `msvc_installation_path`도 함께 편집할 수 있습니다
- **CMake 설정** — `compile_definitions`, `compile_options`, `include_directories`, `link_libraries`를 수정합니다
- **의존성 추가** — 패키지명을 입력하고 **Add** 버튼으로 현재 backend에 맞는 의존성을 추가합니다. `none` backend에서는 추가가 거부되며, 현재 등록된 의존성은 Badge 목록으로 확인할 수 있습니다
- **프리셋 매트릭스** — `[[presets]]` 목록을 직접 추가, 삭제, 편집합니다. `name`, `display_name`, `build_type`, `target_triplet`, `runnable`을 수정할 수 있습니다

### config 저장 / 불러오기

탐색 탭의 여러 카드에서 수정한 값은 **CMake 설정** 카드의 버튼을 기준으로 함께 동기화됩니다.

- **config 저장** — 현재 UI 상태를 `.cppx/config.toml`에 저장합니다
- **config 불러오기** — 현재 작업 폴더의 설정을 다시 읽어와 UI 전체를 갱신합니다

즉, 저장 버튼은 CMake 설정만이 아니라 backend, tool policy, preset matrix까지 함께 반영한다고 생각하면 됩니다.

## 빌드 탭

빌드, 실행, 테스트, 패키징과 툴체인 상태를 다루는 공간입니다.

- **프리셋 선택** — `.cppx/config.toml`에 정의된 프리셋 목록에서 원하는 항목을 선택합니다
- **액션 버튼** — Build, Run, Test, Pack 네 가지 버튼으로 해당 작업을 실행합니다
- **프리셋 실행 가능 여부** — 선택한 프리셋이 `runnable = false`이면 Run 버튼이 비활성화됩니다
- **툴체인 상태** — CMake, Ninja, vcpkg, C++ 컴파일러 각각의 설치 여부와 상세 메타데이터가 표시됩니다
  - `준비됨` — 설치 완료
  - `누락` — 설치 필요
- **도구 설치** — **설치/업데이트** 버튼은 현재 호스트 정책에 따라 관리형 도구를 설치하거나 system 도구 상태를 다시 확인합니다. 진행률은 프로그레스 바로 확인할 수 있습니다
- **툴체인 다시 검사** — 현재 manifest와 PATH/MSVC 탐지를 기준으로 상태를 새로 읽습니다
- **컴파일러 선택 대화상자** — Windows에서 MSVC가 감지되면 설치할 컴파일러를 고르는 대화상자가 열릴 수 있습니다

## 로그 탭

명령 실행 과정에서 발생하는 로그를 실시간으로 확인합니다.

- `child_process.spawn`의 stdout/stderr가 실시간으로 스트리밍됩니다
- 로그 레벨에 따라 색상이 구분됩니다

| 레벨 | 색상 |
|------|------|
| error | 빨간색 |
| warn | 주황색 |
| success | 초록색 |
| stdout | 회색 |
| info | 기본색 |

- 최대 5,000건까지 보관되며, **지우기** 버튼으로 초기화할 수 있습니다
- 새 로그가 추가되면 자동으로 하단으로 스크롤됩니다

## 상태 알림

명령 실행이 끝나면 화면 하단에 결과 알림(Toast)이 표시됩니다. 성공이면 초록색, 오류면 빨간색으로 나타나며 잠시 후 자동으로 사라집니다.

::: tip CLI와 GUI는 같은 엔진입니다
GUI에서 버튼을 클릭하면 내부적으로 CLI와 동일한 `CppxService.execute()`가 호출됩니다. 결과가 다를 일이 없으므로, 상황에 따라 편한 쪽을 사용하면 됩니다.
:::

## Busy 상태

명령이 실행 중일 때는 다른 명령을 동시에 실행할 수 없습니다. 현재 작업이 끝날 때까지 버튼이 비활성화되며, 완료 후 다시 사용할 수 있습니다.
