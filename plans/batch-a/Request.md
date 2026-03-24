/plan
Use $cppx-phase-plan first, then $cppx-phase-execute.

Repository: cppx
Batch: A — Phase 0 + Phase 1

Work on exactly Batch A.

Goal:
- Add a test/CI safety net.
- Extract host-specific behavior behind an adapter.
- Preserve current Windows behavior.

Why this batch exists:
- later work needs safer refactors
- cross-platform support cannot be added cleanly until Windows assumptions are centralized

In scope:
- test runner and characterization tests
- minimal Windows CI
- host platform typing and host adapter interface
- moving key Windows assumptions out of scattered business logic

Out of scope:
- no config schema v2
- no tool catalog/version policy
- no dependency backend abstraction
- no preset matrix redesign
- no macOS/Linux support yet

Constraints:
- preserve current Windows semantics
- add tests before structural refactors where possible
- do not begin Batch B
