/plan
Use $cppx-phase-plan first, then $cppx-phase-execute.

Repository: cppx
Phase: 5 — data-driven preset matrix

Work on exactly Phase 5.

Goal:
- Replace fixed debug/release preset generation with a data-driven preset matrix.
- Keep `debug-x64` and `release-x64` as backward-compatible defaults.

User priorities to keep visible:
- users should be able to declare presets for x64, arm64, ASan, release-lto, and similar workflows from config
- users should not need to hand-edit generated preset files for normal customization
- run/test/pack should respect whether a preset is runnable on the current host

In scope:
- preset model consumption
- configure/build/test/package preset generation
- VSCode task/launch generation updates
- `runnable_on_host` behavior
- tests for preset generation

Out of scope:
- no full foreign-target cross-compile support
- no macOS/Linux native support work in this phase
- no large renderer redesign

Constraints:
- users should not need to hand-edit generated preset files for normal custom presets
- non-runnable presets must fail clearly on run
