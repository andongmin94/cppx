/plan
Use $cppx-phase-plan first, then $cppx-phase-execute.

Repository: cppx
Phase: 7 — GUI, docs, and release polish

Work on exactly Phase 7.

Goal:
- Wire the expanded core capabilities into the GUI.
- Finish docs, migration guidance, and release flow.

In scope:
- GUI editing for backend/tool policy/preset matrix
- docs updates for Windows/macOS/Linux quickstart
- migration guides
- release or artifact automation updates

Out of scope:
- no new core architecture expansion unless required to expose already-built features
- no major UX redesign unrelated to roadmap completion

Constraints:
- renderer should remain a thin layer over core
- docs must clearly explain supported vs unsupported platform behavior
- keep changes scoped to surfacing already-implemented core capabilities
