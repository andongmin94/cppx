/plan
Use $cppx-phase-plan first, then $cppx-phase-execute.

Repository: cppx
Batch: C — Phase 4 + Phase 5

Work on exactly Batch C.

Goal:
- Make dependency management selectable instead of vcpkg-only.
- Replace the fixed preset pair with a data-driven preset matrix.

User priorities to keep visible:
- users should be able to choose `vcpkg`, `conan`, or `none`
- existing vcpkg projects must not break
- users should be able to define presets such as x64, arm64, ASan, release-lto, etc. without hand-editing generated files

In scope:
- dependency backend abstraction
- vcpkg compatibility layer
- minimal Conan and none backends
- data-driven preset generation
- preset-aware run/test/pack behavior
- preset-aware VSCode task/launch generation

Out of scope:
- no macOS/Linux native support yet
- no full foreign-target cross-compile work
- no major GUI expansion

Constraints:
- keep current vcpkg users working
- keep `debug-x64` and `release-x64` as backward-compatible defaults
- do not begin Batch D
