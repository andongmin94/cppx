# Codex quickstart for cppx — v2 batch overlay

이 압축 파일은 `cppx` 저장소 루트에 바로 풀어 쓸 수 있게 만든 **overlay** 입니다.

이번 v2는 **phase 중심 운영**을 유지하면서도, 실제 작업은 **batch 중심**으로 진행하도록 정리했습니다.

핵심 목표는 세 가지를 더 전면에 두는 것입니다.

- Windows / macOS / Linux **크로스플랫폼(native host)** 지원 구조
- `vcpkg`뿐 아니라 `conan`까지 포함한 **dependency backend 선택지**
- CMake / Ninja 같은 도구를 설치할 때 **버전과 install mode 선택지** 확보

## 1. 압축 풀기

`cppx` 프로젝트 루트에서 압축을 풉니다.

그러면 아래 파일들이 생깁니다.

- `AGENTS.md`
- `.agents/skills/...`
- `plans/batch-a` ~ `plans/batch-e`
- `plans/phase-0` ~ `plans/phase-7`

## 2. Codex를 저장소 루트에서 시작

Codex CLI / IDE / App 어디서든 **repo root** 기준으로 여세요.

## 3. 의존성 설치

```bash
cd packages
npm install
```

## 4. 추천 실행 방식

가장 추천하는 방식은 **batch 요청서**를 그대로 붙여 넣는 것입니다.

예:
- `plans/batch-a/Request.md`
- `plans/batch-b/Request.md`
- `plans/batch-c/Request.md`
- `plans/batch-d/Request.md`
- `plans/batch-e/Request.md`

권장 흐름:
1. `/plan` 사용
2. `$cppx-phase-plan` → 계획 문서 점검
3. `$cppx-phase-execute` → 구현
4. 필요하면 `$cppx-phase-review` → 병합 전 검토

참고:
- skill 이름은 `phase`로 되어 있지만, v2에서는 **batch에도 그대로 사용**합니다.
- 더 세밀하게 통제하고 싶으면 `plans/phase-*` 요청서를 사용할 수 있습니다.

## 5. 배치별 의미

### Batch A
- 테스트 안전망
- Windows 종속 로직을 adapter 뒤로 숨기기

### Batch B
- config schema v2
- CMake / Ninja 같은 도구의 **catalog / version / install mode** 정책

### Batch C
- `vcpkg` / `conan` / `none` backend 구조
- data-driven preset matrix

### Batch D
- Windows / macOS / Linux **native host support**

### Batch E
- GUI 반영
- 문서 / migration / release 마감

## 6. 권장 순서

1. Batch A
2. Batch B
3. Batch C
4. Batch D
5. Batch E

## 7. 꼭 확인할 지점

Batch마다 아래 5가지를 확인하세요.

- `changed files`
- `design decisions`
- `validations run and results`
- `backward-compatibility impact`
- `remaining risks`

## 8. 한 번에 전부 큐에 넣지 말기

권장 방식은 아래와 같습니다.

- **한 번에 한 batch만** 실행
- batch 내부 milestone은 Codex가 연속 처리 가능
- batch 종료 시점마다 사람이 검토

즉, 완전 수동도 아니고 완전 방치도 아닙니다.
**"배치 자동 실행 + 배치 끝 검토"**가 가장 안전합니다.
