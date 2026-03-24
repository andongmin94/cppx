# Phase 7 Plan — GUI, docs, and release polish

## Goal

Wire the expanded core capabilities into the GUI and finish docs, migration guidance, and release flow.

## Non-goals

- No new core architecture expansion unless needed to expose already-built features.
- No major UX redesign unrelated to roadmap completion.
- No reopening earlier phase scope without a clear bug fix.

## Milestones

### M1 — Expose finished core capabilities in the GUI

**Scope**

- Add UI editing for backend selection, tool policy, and preset matrix settings.
- Keep renderer as a thin layer over existing core/services.
- Avoid putting business logic in the renderer.

**Expected files**

- `packages/src/renderer/...`
- preload/IPC files if needed
- tests/docs

**Acceptance criteria**

- Major core options can be changed from the GUI.
- Renderer remains thin.

**Validation commands**

- `cd packages && npm run typecheck`
- `cd packages && npm run test`
- `cd packages && npm run build`

### M2 — Finish docs and migration guidance

**Scope**

- Write/update Windows/macOS/Linux quickstart docs.
- Document config v1 to v2 migration.
- Document backend selection and preset examples.
- Document current support boundaries.

**Expected files**

- `docs/...`
- root guidance files if needed

**Acceptance criteria**

- A new user can understand setup on all supported hosts.
- Existing users can see what changed and how to migrate.

**Validation commands**

- review docs build or link correctness if available
- `cd packages && npm run typecheck`
- `cd packages && npm run build`

### M3 — Release and artifact polish

**Scope**

- Tighten release notes, artifact generation, or publishing automation.
- Ensure the release story matches the new platform scope.
- Only surface already-built capabilities.

**Expected files**

- release workflow/config files
- docs
- packaging metadata as needed

**Acceptance criteria**

- Release process is clearer and more repeatable.
- Platform support is described accurately in release assets.

**Validation commands**

- `cd packages && npm run typecheck`
- `cd packages && npm run build`
- review release workflow or packaging config

## Backward compatibility

- GUI should expose existing capabilities, not redefine their logic.
- Docs must be honest about supported and unsupported flows.
- Release assets should not promise more than the code supports.

## Risks / open questions

- Renderer may need some IPC expansion to stay thin.
- Docs can drift quickly if commands or generated artifacts changed in earlier phases.
- Release automation can be platform-specific and should stay aligned with actual support.
