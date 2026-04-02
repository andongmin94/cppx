# TASK

Execute `SPEC.md` exactly. Do not create a separate plan.

## Current batch

This batch establishes the cross-platform parity foundation for `cppx` and aligns the repository around a root-only instruction system.

## Phase order

### Phase 1 — root instruction and contributor baseline

Goals:

- keep the root instruction model limited to `AGENTS.md`, `SPEC.md`, and `TASK.md`
- keep `README.md`, `CONTRIBUTING.md`, and `LICENSE.md` as the only other required root markdown documents
- remove or stop referencing historical AI overlay systems
- establish root-first contributor and agent workflow

Expected implementation outcomes:

- no active code or docs depend on deleted legacy overlay files
- contributor guidance is root-first
- root command entrypoints exist, or the repository has a clearly documented root-level fallback strategy

### Phase 2 — canonical host capability contract

Goals:

- introduce one shared host-capability/tool-lifecycle contract
- stop CLI, GUI, docs, and tests from carrying conflicting truth tables

Expected implementation outcomes:

- one canonical representation of host support, provider policy, lifecycle capability, and support tier
- GUI fallback behavior no longer contradicts CLI/docs
- support matrix claims become testable

### Phase 3 — compiler model and backend parity

Goals:

- make compiler selection host-neutral in structure
- remove Windows-only compiler framing from CLI help and UX
- make backend parity real on official hosts

Expected implementation outcomes:

- backend choices are `vcpkg | conan | none` on all official hosts in CLI and GUI
- compiler choices are represented through one model with host-valid options
- non-Windows hosts no longer default to a visible `mingw` compiler family
- Windows Conan is not left as a second-class detect-only path if official parity is claimed

### Phase 4 — official-host implementation alignment

Goals:

- align Windows, macOS, and Ubuntu LTS profiles (22.04, 24.04) with the same product contract
- keep other Linux distributions explicitly best-effort and system-only

Expected implementation outcomes:

- Windows: first-class tool-management behavior for the official slice
- macOS: no contradiction between official managed path and runtime capability messaging
- Ubuntu LTS profiles (22.04, 24.04): official managed Linux slice implemented and described consistently
- other Linux: clearly marked conservative/system-only path

### Phase 5 — docs and UX unification

Goals:

- make human docs and runtime UX say the same thing
- make repo root docs authoritative for contributors

Expected implementation outcomes:

- `README.md`, `CONTRIBUTING.md`, `docs/guide/install.md`, and `docs/guide/cli.md` agree on support policy
- CLI help text and GUI labels use the same terms
- root-first commands are documented

### Phase 6 — validation and anti-drift checks

Goals:

- make support-policy drift easier to catch

Expected implementation outcomes:

- tests or contract checks cover the host capability matrix
- CI or local validation includes those checks
- regressions in support claims are easier to detect automatically

## Required validations

Run as many of these as the environment supports:

```bash
npm run typecheck
npm run test
npm run build
npm run smoke:ci
```

If root scripts do not exist yet, use the temporary fallback equivalents:

```bash
npm --prefix packages run typecheck
npm --prefix packages run test
npm --prefix packages run build
npm --prefix packages run smoke:ci
```

## Final report format

The final execution report must include:

1. completed phases
2. changed files
3. key design decisions
4. validation results
5. remaining risks or deferred work
