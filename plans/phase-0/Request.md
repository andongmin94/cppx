/plan
Use $cppx-phase-plan first, then $cppx-phase-execute.

Repository: cppx
Phase: 0 — test safety net and minimal Windows CI

Work on exactly Phase 0.

Goal:
- Add a test runner and characterization tests that lock current behavior.
- Add minimal CI on windows-latest for typecheck + tests.

In scope:
- config read/write behavior
- generated artifacts behavior
- path/tool root resolution behavior
- current Windows-oriented behavior
- CI for current repo commands

Out of scope:
- no feature changes
- no host adapter work
- no config schema redesign
- no macOS/Linux support
- no renderer improvements unless needed only for testability

Constraints:
- preserve current semantics
- add tests before structural refactors
- final report must include changed files, design decisions, validations, compatibility impact, and remaining risks
