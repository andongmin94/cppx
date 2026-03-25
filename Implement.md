# Cross-Platform Host Parity Implement

## Source of truth

This file follows `Plan.md` in the same directory.

## Goal summary

Execute a product-parity pass so `cppx` can provide a Windows-level host-tooling experience on the official macOS and Linux support matrix, not just a shared workflow shell.

## Operating rules

- Execute exactly the milestones in `Plan.md`.
- Complete one milestone at a time.
- Run validations after each milestone.
- Fix failures before moving on.
- Preserve current Windows capability while extending parity.
- Prefer explicit support over vague "best effort" claims.
- Treat destructive host actions conservatively.
- Keep ownership tracking accurate enough to support safe remove behavior.
- Update tests and docs in the same milestone as the code change.
- Final report must include changed files, design decisions, validations, compatibility impact, and remaining risks.

## Milestone execution order

1. M1 - Host parity contract and tool lifecycle model
2. M2 - macOS managed host parity
3. M3 - Linux managed host parity
4. M4 - Cross-platform CLI/GUI parity for tool management
5. M5 - CI, docs, and release readiness for parity

## Expected files to touch

- `packages/src/shared/**`
- `packages/src/main/cli.ts`
- `packages/src/main/ipc.ts`
- `packages/src/main/cppx/installers.ts`
- `packages/src/main/cppx/service.ts`
- `packages/src/main/cppx/tool-catalog.ts`
- `packages/src/main/cppx/types.ts`
- `packages/src/main/cppx/platform/**`
- `packages/src/renderer/src/App.tsx`
- `packages/scripts/**`
- `packages/test/**`
- `packages/package.json`
- `docs/**`
- `.github/workflows/**`

## Scope guardrails

- No visual redesign.
- No support claim for arbitrary Linux distributions in this plan.
- No hidden uninstall of preexisting host tools.
- No replacement of the existing project/config model unless required for tool-lifecycle parity.
- No package-registry browser or marketplace features.
- No signing/notarization pipeline.
- No auto-update system.

## Milestone-specific notes

### M1 notes

- Start by modeling capability and ownership correctly before adding more actions.
- Do not let GUI invent host defaults independently of the core service.
- If the current compiler-family terminology is too Windows-shaped, fix the public model early.

### M2 notes

- macOS parity should target a real, supportable provider path.
- Homebrew-backed operations should be explicit about prerequisites and ownership.
- Use conservative defaults when a tool is already present on the machine.

### M3 notes

- Linux parity must be scoped to an explicit distro/provider combination.
- Unsupported distros should fail clearly into `system` mode rather than silently pretending parity.
- Keep the `apt` path reproducible enough for CI.

### M4 notes

- CLI and GUI should expose the same practical lifecycle, even if the underlying provider differs by host.
- If a lifecycle action is unsupported, say why and what the user can do instead.
- Avoid dangerous "remove everything" behavior.

### M5 notes

- CI should validate the support matrix the docs claim.
- Release wording must match the real host matrix.
- Prefer a smaller true claim over a larger unverified claim.

## Stop-and-fix rule

Stop when a validation fails, a host action would risk removing user-owned tools incorrectly, or scope drifts outside the declared parity matrix.
