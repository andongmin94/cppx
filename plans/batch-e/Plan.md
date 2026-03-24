# Batch E Plan — Phase 7

## Goal

Surface the expanded core capabilities in the GUI, finish docs and migration guidance, and tighten the release workflow.

## Non-goals

- No new core architecture expansion except what is necessary to expose already-built features.
- No major UX redesign unrelated to roadmap completion.

## Milestones

### M1 — GUI wiring for new core capabilities

**Scope**
- Expose dependency backend choice, tool policy, and preset matrix editing in the GUI.
- Keep renderer as a thin layer over core.

**Acceptance criteria**
- GUI can read and edit the core settings added in previous batches.
- Renderer does not re-own core business logic.

**Validation commands**
- `cd packages && npm run typecheck`
- `cd packages && npm run build`

### M2 — Docs and migration guidance

**Scope**
- Update quickstart/docs for Windows/macOS/Linux.
- Add migration guidance for config/schema/backend changes.

**Acceptance criteria**
- Docs explain supported vs unsupported platform behavior.
- Migration steps are explicit for existing users.

**Validation commands**
- review docs changes
- `cd packages && npm run typecheck`

### M3 — Release/artifact polish

**Scope**
- Clean up release notes, artifacts, and CI/release automation where needed.

**Acceptance criteria**
- Release flow reflects the current product surface.
- User-facing packaging/docs are coherent.

**Validation commands**
- review workflow/release files
- `cd packages && npm run build`

## Backward compatibility

- GUI changes should expose existing core behavior rather than replace it.
- Docs must not promise unsupported platform/back-end/tooling ranges.

## Risks / open questions

- It is easy for renderer work to overstep and recreate core business rules.
- Release automation varies by environment and may require conservative scoping.
