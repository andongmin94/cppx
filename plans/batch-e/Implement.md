# Batch E Implement

## Source of truth

This file follows `Plan.md` in the same directory.

## Goal summary

Wire the finished core capabilities into the GUI, finalize documentation, and polish the release process.

## Operating rules

- Execute exactly Batch E.
- Renderer remains a thin layer over core.
- Run validations after each milestone.
- Fix failures before continuing.

## Milestone execution order

1. M1 — GUI wiring for new core capabilities
2. M2 — Docs and migration guidance
3. M3 — Release/artifact polish

## Expected files to touch

- `packages/src/renderer/...`
- docs files under `docs/`
- release/CI files as needed
- migration guidance files

## Scope guardrails

- No new roadmap architecture unless required to expose already-completed features.
- No large unrelated UX redesign.

## Stop-and-fix rule

Stop when renderer starts re-implementing core logic, validation fails, or the diff expands beyond roadmap completion work.
