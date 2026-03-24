/plan
Use $cppx-phase-plan first, then $cppx-phase-execute.

Repository: cppx
Phase: 3 — tool catalog and version/install policy

Work on exactly Phase 3.

Goal:
- Remove hardcoded CMake/Ninja install/version assumptions from core logic.
- Introduce tool catalog and install policy concepts.

User priorities to keep visible:
- users should be able to choose how tools are sourced: `system` vs `managed`
- users should be able to express version intent such as `default`, `latest`, or an exact version
- current Windows defaults should continue to work unless explicitly changed by config

In scope:
- externalized tool catalog
- version policy model
- install mode model
- manifest metadata expansion
- system vs managed tool distinction

Out of scope:
- no dependency backend abstraction
- no preset matrix rewrite
- no macOS/Linux native support

Constraints:
- keep current Windows defaults working
- separate policy from installer execution
- core should no longer hardcode CMake/Ninja versions in business logic
- expand tests around manifest/tool resolution behavior
