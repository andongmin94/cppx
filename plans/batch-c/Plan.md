# Batch C Plan - Phase 4 + Phase 5

## Goal

Introduce dependency backend abstraction and data-driven preset generation while preserving the current Windows-first vcpkg workflow as the default compatibility path.

This batch builds on the Batch B baseline where:

- `cd packages && npm run typecheck`
- `cd packages && npm run test`

are the repo-standard validations.

## Non-goals

- No macOS/Linux native host enablement yet.
- No renderer-first expansion.
- No full foreign-target cross-compilation work.
- No release/migration polish work beyond what Batch C needs to stay coherent.

## Milestones

### M1 - Dependency backend abstraction and vcpkg compatibility

**Scope**
- Introduce a backend interface for generated dependency artifacts and CMake integration.
- Move vcpkg-specific generation behind that interface.
- Keep current vcpkg projects working without config changes.

**Acceptance criteria**
- Generic project generation no longer hardcodes vcpkg-only behavior directly.
- Existing `dependency_backend = "vcpkg"` projects still generate the current effective output.

**Validation commands**
- `cd packages && npm run typecheck`
- `cd packages && npm run test`

### M2 - Minimal `conan` and `none` backends

**Scope**
- Add minimal backend implementations for `conan` and `none`.
- Make generated artifacts reflect the selected backend.
- Keep unsupported workflow gaps explicit in errors or docs.

**Acceptance criteria**
- `dependency_backend = "none"` works for plain CMake generation.
- `dependency_backend = "conan"` is represented by generated backend-specific files and wiring.
- Unsupported behavior is explicit instead of silently falling back to vcpkg.

**Validation commands**
- `cd packages && npm run test`
- `cd packages && npm run typecheck`

### M3 - Data-driven preset matrix generation

**Scope**
- Replace fixed debug/release preset generation with config-driven preset expansion.
- Keep `debug-x64` and `release-x64` as defaults when presets are absent.
- Preserve current Windows binary naming and toolchain assumptions.

**Acceptance criteria**
- Declared `[[presets]]` entries drive generated configure/build/test/package presets.
- Old projects without custom presets still behave like today.

**Validation commands**
- `cd packages && npm run typecheck`
- `cd packages && npm run test`

### M4 - Preset-aware run/test/pack and VSCode integration

**Scope**
- Make runtime flows use preset metadata instead of fixed names.
- Generate VSCode tasks/launch configs from the effective preset set.
- Fail clearly for presets that should not run on the host.

**Acceptance criteria**
- `run`, `test`, and `pack` respect preset metadata.
- VSCode tasks/launch output matches the effective preset set.
- Non-runnable presets fail with a clear message.

**Validation commands**
- `cd packages && npm run typecheck`
- `cd packages && npm run test`

## Backward compatibility

- Existing vcpkg projects must still load and work.
- If no presets are declared, `debug-x64` and `release-x64` must remain available.
- Windows-first executable naming and current toolchain behavior must remain intact.

## Risks / open questions

- Backend abstraction and preset generation both touch the same generator path, so fixture churn can hide regressions.
- Conan support should stay deliberately minimal in this batch rather than implying full workflow coverage.
- Preset-driven VSCode generation may expose assumptions currently baked into debug-only task names.
