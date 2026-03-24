/plan
Use $cppx-phase-plan first, then $cppx-phase-execute.

Repository: cppx
Batch: B — Phase 2 + Phase 3

Work on exactly Batch B.

Goal:
- Introduce config schema v2 with backward compatibility.
- Replace hardcoded tool install/version assumptions with configurable policy.

User priorities to keep visible:
- future cross-platform support depends on a richer config model
- users should be able to choose tool install mode and version policy for tools like CMake and Ninja
- current Windows defaults must keep working

In scope:
- normalized config schema v2
- parser compatibility layer
- tool catalog
- install mode and version policy model
- manifest/status/CLI integration for tool source and version metadata

Out of scope:
- no dependency backend abstraction yet
- no preset matrix generator rewrite yet
- no macOS/Linux native support yet

Constraints:
- existing config must still load
- core should no longer hardcode CMake/Ninja versions in business logic
- do not begin Batch C
