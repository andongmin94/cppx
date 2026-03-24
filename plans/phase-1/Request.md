/plan
Use $cppx-phase-plan first, then $cppx-phase-execute.

Repository: cppx
Phase: 1 — extract host-specific behavior behind an adapter

Work on exactly Phase 1.

Goal:
- Introduce a host/platform adapter layer.
- Move Windows assumptions behind that adapter.
- Preserve current Windows behavior.

In scope:
- host platform typing
- adapter interface
- paths / installers / run-test-pack host abstraction
- package script cleanup if needed for future cross-platform work

Out of scope:
- no real macOS/Linux support yet
- no dependency backend abstraction
- no config schema redesign
- no preset matrix work

Constraints:
- do not scatter new platform conditionals across many files
- adapter must centralize host behavior
- Windows behavior must remain intact
- tests should be expanded where refactoring risk is high
