# cppx roadmap reference

## Batch A = Phase 0 + Phase 1
Build a safe test/CI baseline and extract host-specific behavior behind an adapter while preserving current Windows behavior.

## Batch B = Phase 2 + Phase 3
Make config expressive enough for future compiler/tool/dependency/preset settings, then remove hardcoded tool-version assumptions by introducing a tool catalog and install/version policy.

## Batch C = Phase 4 + Phase 5
Introduce dependency backend abstraction so users can choose `vcpkg`, `conan`, or `none`, then replace the fixed debug/release preset model with a data-driven matrix.

## Batch D = Phase 6
Enable native host support on Windows, macOS, and Linux. This is about host-native workflows, not full foreign-target cross-compilation.

## Batch E = Phase 7
Finish GUI wiring, docs, migration guidance, and release process polish.

## Detailed phase reference

### Phase 0
Add tests and minimal Windows CI without changing behavior.

### Phase 1
Extract host-specific behavior behind a host adapter. Preserve current Windows behavior.

### Phase 2
Replace the limited config parser/model with schema v2 while keeping backward compatibility.

### Phase 3
Externalize tool version/catalog policy and split install policy from installer execution.

### Phase 4
Introduce dependency backend abstraction for `vcpkg` / `conan` / `none`.

### Phase 5
Move presets from fixed debug/release generation to a data-driven matrix.

### Phase 6
Enable native host support on macOS and Linux. Do not aim for full foreign-target cross-compilation.

### Phase 7
Finish GUI wiring, docs, release process, and migration guidance.
