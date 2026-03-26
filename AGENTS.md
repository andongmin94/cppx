# AGENTS

This file is the canonical repository-wide instruction set for AI agents working in this repository.

## Authority and file order

Read files in this order at the start of every session:

1. `/AGENTS.md` — repository-wide operating rules
2. `/SPEC.md` — the human-authored product and implementation specification
3. `/TASK.md` — the current execution batch and phase order

If these files conflict:

- direct user instructions override all repository files
- `TASK.md` narrows execution scope for the current batch
- `SPEC.md` defines the product contract and must not be violated by `TASK.md`
- `AGENTS.md` defines how work is executed

Only these root instruction files are active. Do not recreate or follow historical overlay systems such as `plans/`, `.agents/`, `CODEX_QUICKSTART.md`, `Plan.md`, `Implement.md`, `Request.md`, or `specs/`.

## Core operating model

`cppx` is a cross-platform C++ toolchain and workflow manager.

The primary repository goal is **cross-platform parity of user experience**.
That means:

- Windows, macOS, and the official Ubuntu slice may use different providers internally
- but CLI and GUI must expose the same decision surface and the same terminology
- backend choice, compiler choice, tool mode, provider, ownership, lifecycle capability, status, and doctor guidance must line up across hosts

Do not introduce host-specific UX that breaks this model unless `SPEC.md` explicitly allows it.

## Execution rules

- Work from the repository root.
- Prefer root entrypoints when they exist. If they do not exist yet, add them or use `npm --prefix packages ...` as a temporary fallback.
- Do not invent a new roadmap, alternative plan, or parallel spec. Execute the existing spec.
- Keep changes phase-scoped and easy to review.
- Update docs in the same change when behavior, naming, support level, or workflow changes.
- Keep CLI and GUI terminology aligned.
- Do not leave support claims inconsistent across README, docs, CLI help text, GUI labels, and tests.
- Do not silently keep stale fallback matrices in the GUI when a shared capability contract exists or should exist.
- Do not widen support claims beyond what is actually implemented and validated.

## Validation rules

- Run the validation commands listed in `TASK.md` after each completed phase when practical.
- Fix failures before moving to the next phase.
- If a validation cannot run in the current environment, state that clearly in the final report and still run all other applicable validations.

## Expected final report

At the end of the session, report:

1. completed phases
2. changed files
3. key design decisions
4. validation results
5. remaining risks, gaps, or deferred work
