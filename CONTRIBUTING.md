# CONTRIBUTING

Thanks for contributing to `cppx`.

This repository is currently standardizing around a single cross-platform product contract and a root-only AI instruction system.

## Root document policy

The root markdown files are intentionally limited to:

- `README.md`
- `CONTRIBUTING.md`
- `LICENSE.md`
- `AGENTS.md`
- `SPEC.md`
- `TASK.md`

Do not reintroduce parallel planning systems or historical AI overlays.

## How to work in this repository

Use the repository root as the default working directory.

Validation commands:

```bash
npm --prefix packages run typecheck
npm --prefix packages run test
npm --prefix packages run build
npm --prefix packages run smoke:ci
```

## Current engineering priority

The current repository priority is **cross-platform parity**.

That means:

- Windows, macOS, and the official Ubuntu LTS profile slice (22.04, 24.04) must expose the same conceptual controls in CLI and GUI
- docs, runtime messaging, and tests must agree on support policy
- host-specific providers may differ internally, but the user-visible model must stay consistent

## Change expectations

A good change in this repository should:

- stay scoped to the current phase in `TASK.md`
- follow the product contract in `SPEC.md`
- update docs when behavior or support claims change
- avoid introducing new drift between CLI, GUI, docs, and tests

## Validation

Run the validations listed in `TASK.md`.

If a validation cannot run in your environment, document that clearly in your change summary.
