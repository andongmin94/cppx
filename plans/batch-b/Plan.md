# Batch B Plan - Phase 2 + Phase 3

## Goal

Make configuration expressive enough for future compiler/tool/dependency/preset settings and replace hardcoded tool-version/install assumptions with a configurable catalog and policy model.

This batch builds on the Batch A baseline where `cd packages && npm run typecheck` and `cd packages && npm run test` are the repo-standard validations.

## Non-goals

- No dependency backend abstraction yet.
- No preset matrix generation rewrite yet.
- No macOS/Linux native support enablement yet.
- No large renderer work.

## Milestones

### M1 - Config schema v2 model and normalization

**Scope**
- Introduce a normalized config v2 model.
- Preserve backward compatibility with existing config inputs.
- Separate external file shape from internal normalized shape.

**Acceptance criteria**
- Existing config still loads.
- New fields for compiler/tools/dependencies/presets can be represented.

**Validation commands**
- `cd packages && npm run typecheck`
- `cd packages && npm run test`

### M2 - Parsing and write/read compatibility

**Scope**
- Replace or wrap the limited parser.
- Add tests for parse + normalize + read/write compatibility.

**Acceptance criteria**
- Old config examples still parse.
- New schema examples parse and normalize.
- Existing generated behavior remains stable unless intentionally changed.

**Validation commands**
- `cd packages && npm run test`
- `cd packages && npm run typecheck`

### M3 - Tool catalog and version/install policy

**Scope**
- Externalize hardcoded tool version/source assumptions.
- Introduce tool catalog and install/version policy concepts.
- Support system vs managed tool distinction.

**Acceptance criteria**
- CMake/Ninja versions are no longer hardwired in core business logic.
- Policy can express `default`, `latest`, exact version, and `system` usage intent.

**Validation commands**
- `cd packages && npm run typecheck`
- `cd packages && npm run test`

### M4 - Manifest/status/CLI integration for tool policy

**Scope**
- Reflect policy and installed-source metadata in manifests/status output.
- Keep current Windows defaults working.
- Keep the current CLI surface readable while exposing any new policy metadata conservatively.

**Acceptance criteria**
- Installed tool metadata captures source/mode/version details.
- Existing defaults remain backward compatible.

**Validation commands**
- `cd packages && npm run typecheck`
- `cd packages && npm run test`

## Backward compatibility

- Existing `.cppx/config.toml` should still load.
- Existing Windows defaults for CMake/Ninja should continue to work unless explicitly configured otherwise.

## Risks / open questions

- A richer config model may expose generator assumptions that need careful compatibility shims.
- The repo may not yet have a stable public surface for tool install policy, so naming should stay conservative.
