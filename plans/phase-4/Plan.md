# Phase 4 Plan — dependency backend abstraction

## Goal

Break the hard coupling to vcpkg and introduce dependency backend abstraction for `vcpkg`, `conan`, and `none`.

## Non-goals

- No macOS/Linux host enablement.
- No preset matrix completion.
- No GUI-first work.
- No attempt at perfect Conan coverage in one step.

## Milestones

### M1 — Define backend abstraction and move types

**Scope**

- Design `DependencyBackend` responsibilities.
- Remove mandatory vcpkg presence from the generic toolchain model.
- Introduce backend selection in normalized config/types.

**Expected files**

- `packages/src/main/cppx/types.ts`
- new backend interface files
- config-related types
- tests

**Acceptance criteria**

- Backend selection is modeled without making vcpkg mandatory everywhere.
- The generic project layer can depend on an interface instead of concrete vcpkg code.

**Validation commands**

- `cd packages && npm run typecheck`
- `cd packages && npm run test`

### M2 — Implement backend-specific generation hooks

**Scope**

- Move manifest generation and CMake integration behind backend implementations.
- Keep vcpkg fully functional.
- Provide minimal viable `conan` and `none` backends.

**Expected files**

- backend implementation files
- `packages/src/main/cppx/project.ts`
- service/command files
- tests/fixtures

**Acceptance criteria**

- `backend = "vcpkg"` preserves current behavior.
- `backend = "conan"` is representable and minimally wired.
- `backend = "none"` supports plain CMake projects.

**Validation commands**

- `cd packages && npm run typecheck`
- `cd packages && npm run test`

### M3 — Make CLI/service flows backend-aware

**Scope**

- Update `add` and other relevant flows to dispatch through the active backend.
- Surface backend limits clearly in errors or docs.
- Add compatibility and regression tests.

**Expected files**

- `packages/src/main/cli.ts`
- `packages/src/main/cppx/service.ts`
- backend and tests/docs files

**Acceptance criteria**

- Backend choice influences package-add and generation behavior correctly.
- vcpkg users are not broken.
- Conan support limits are explicit.

**Validation commands**

- `cd packages && npm run typecheck`
- `cd packages && npm run test`

## Backward compatibility

- Existing vcpkg projects must still load and work.
- Current `add` UX should remain similar for vcpkg users.
- Backend-specific generated files should come from the selected backend only.

## Risks / open questions

- Project generation may have vcpkg assumptions in unexpected places.
- Conan integration details may need a later follow-up phase for depth.
- Toolchain model changes can ripple into UI and IPC consumers.
