# Phase 2 Plan — config schema v2 with backward compatibility

## Goal

Replace or wrap the limited config parser with a schema v2 model while keeping existing config inputs working.

## Non-goals

- No dependency backend implementation yet.
- No preset matrix generation rewrite yet.
- No macOS/Linux support activation.
- No large renderer changes.

## Milestones

### M1 — Define schema v2 and normalization strategy

**Scope**

- Document the internal normalized config shape.
- List supported legacy inputs and how they map into the new model.
- Choose whether to keep or replace the existing TOML parser.

**Expected files**

- config/type files under `packages/src/main/cppx/`
- plan notes and tests

**Acceptance criteria**

- There is a single internal normalized config model.
- Backward-compatibility strategy is explicit.

**Validation commands**

- `cd packages && npm run typecheck`
- `cd packages && npm run test`

### M2 — Implement schema v2 parsing and normalization

**Scope**

- Replace or wrap the limited parser.
- Support legacy config inputs.
- Normalize into v2 with defaults.

**Expected files**

- config parser/loader files
- related type files
- tests/fixtures

**Acceptance criteria**

- Old config still loads.
- New schema fields can be expressed and normalized.
- Normalization is covered by tests.

**Validation commands**

- `cd packages && npm run typecheck`
- `cd packages && npm run test`

### M3 — Protect generated behavior during schema transition

**Scope**

- Make current generators consume normalized config without broad functional change.
- Verify generated artifacts remain compatible.
- Document any intentional serialized-format differences.

**Expected files**

- generator-facing config consumers
- tests and snapshots
- docs if config examples changed

**Acceptance criteria**

- Schema expressiveness increases without destabilizing current project generation.
- Generated outputs remain compatible unless explicitly justified.

**Validation commands**

- `cd packages && npm run typecheck`
- `cd packages && npm run test`

## Backward compatibility

- Existing `.cppx/config.toml` must keep loading.
- Legacy project inputs should continue to migrate/load.
- Current generation behavior should stay stable where possible.

## Risks / open questions

- Comment preservation may be difficult if moving to a standard TOML library.
- Legacy inputs might rely on undocumented quirks.
- Generator code may assume the old shape more widely than expected.
