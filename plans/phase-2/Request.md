/plan
Use $cppx-phase-plan first, then $cppx-phase-execute.

Repository: cppx
Phase: 2 — config schema v2 with backward compatibility

Work on exactly Phase 2.

Goal:
- Replace or wrap the limited config parser with a schema v2 model.
- Keep existing config inputs working.

In scope:
- parsing/normalization layer
- backward-compatible config loading
- schema fields needed for future compiler/tools/dependencies/presets
- tests for parse + normalize behavior

Out of scope:
- no Conan/vcpkg backend implementation
- no preset matrix generation rewrite
- no macOS/Linux enablement

Constraints:
- existing config must still load
- this phase is about expressiveness and normalization, not full generator changes
- preserve current generated behavior where possible
