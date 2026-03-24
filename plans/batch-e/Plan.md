# Batch E Plan

## Goal

Expose the capabilities completed in batches A through D in the GUI, finish user-facing documentation and migration guidance, and tighten release-facing polish without expanding the core roadmap scope.

## Non-goals

- No new core architecture work except thin IPC or renderer wiring needed to surface existing features.
- No major visual redesign unrelated to completing the roadmap.
- No reopening earlier batches except for bugs found while exposing existing behavior.

## Milestones

### M1 - GUI wiring for finished core capabilities

**Scope**
- Surface dependency backend selection in the renderer.
- Surface tool policy editing for `cmake`, `ninja`, `vcpkg`, and `cxx`.
- Surface preset matrix editing and default preset selection.
- Keep renderer logic thin and reuse the existing config/service contracts.

**Acceptance criteria**
- The GUI can load and save the config fields introduced in batches B through D.
- Renderer state does not re-implement backend, toolchain, or preset business rules.
- Existing CLI/core behavior remains the source of truth.

**Validation**
- `cd packages && npm run typecheck`
- `cd packages && npm run test:ci`
- `cd packages && npm run build`
- Push the milestone branch and confirm GitHub Actions `Native CI` is green on `windows-latest`, `macos-latest`, and `ubuntu-latest`

### M2 - Docs and migration guidance

**Scope**
- Update quickstart and guide docs for Windows, macOS, and Linux.
- Document current support boundaries for native hosts, dependency backends, and tool modes.
- Add migration guidance for legacy config/project users moving to schema v2 and the new backend/preset model.

**Acceptance criteria**
- A new user can understand host setup and supported workflows on each platform.
- An existing user can see what changed, what stayed compatible, and how to migrate.
- Docs do not promise unsupported behavior.

**Validation**
- `cd packages && npm run typecheck`
- `cd packages && npm run build`
- Review rendered docs content for accuracy and broken command guidance
- Push the milestone branch and confirm GitHub Actions `Native CI` is green on `windows-latest`, `macos-latest`, and `ubuntu-latest`

### M3 - Release and artifact polish

**Scope**
- Align release metadata and automation with the now cross-platform-aware product surface.
- Tighten packaging/release guidance so published artifacts and docs match actual support.
- Keep changes conservative and focused on release clarity, not new delivery features.

**Acceptance criteria**
- Release-facing metadata and automation describe the current product honestly.
- Packaging and release guidance match the validated host support story.
- CI and release changes stay inside batch E scope.

**Validation**
- `cd packages && npm run typecheck`
- `cd packages && npm run test:ci`
- `cd packages && npm run build`
- Review release workflow and packaging metadata changes
- Push the milestone branch and confirm GitHub Actions `Native CI` is green on `windows-latest`, `macos-latest`, and `ubuntu-latest`

## Backward compatibility

- GUI changes must expose existing config and service behavior rather than replace it.
- Existing config migration paths must keep working.
- Docs and release metadata must describe the validated support matrix only.

## Known risks / open questions

- Renderer work can easily drift into duplicating core config normalization.
- Docs may lag behind actual validation if commands or defaults change mid-batch.
- GitHub Actions validation after each milestone adds turnaround time, so milestones must stay small and coherent.
