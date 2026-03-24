# Batch E Implement

## Source of truth

This document follows `plans/batch-e/Plan.md`.

## Goal summary

Complete batch E by wiring finished core capabilities into the GUI, updating docs and migration guidance, and polishing release-facing metadata and automation.

## Operating rules

- Execute exactly batch E and nothing beyond it.
- Complete one milestone at a time in order.
- Run the listed local validations after each milestone.
- Push after each milestone and verify GitHub Actions `Native CI` across Windows, macOS, and Linux before continuing.
- Stop and fix any validation or CI failure before moving to the next milestone.
- Keep renderer logic thin over existing IPC/service contracts.

## Milestone execution order

1. M1 - GUI wiring for finished core capabilities
2. M2 - Docs and migration guidance
3. M3 - Release and artifact polish

## Expected files to touch

- `packages/src/renderer/**`
- `packages/src/preload/**`
- `packages/src/main/ipc.ts`
- `packages/src/main/cppx/service.ts`
- `docs/**`
- `README.md`
- release or workflow metadata as needed

## Scope guardrails

- No new roadmap architecture unless required to expose already-built behavior.
- No major unrelated UX redesign.
- No opportunistic cleanup outside batch E.
- Do not weaken Windows behavior while polishing cross-platform UX/docs.

## Stop-and-fix rule

Stop before continuing when:
- `typecheck`, `test:ci`, or `build` fails
- GitHub Actions `Native CI` is not green on any target OS
- the renderer starts owning business rules that already exist in core
- a needed change clearly belongs to a later, non-batch-E scope

## Milestone work log

- [ ] M1 complete
- [ ] M2 complete
- [ ] M3 complete
