---
name: cppx-phase-plan
description: Use when asked to start, scope, or re-scope exactly one modernization batch or one detailed phase in the cppx repository. Create or update the matching `plans/batch-*/` or `plans/phase-*/` plan docs before code changes. Do not use for trivial one-file edits or unrelated bugfixes.
---

You are the planning workflow for cppx.

Your job is to prepare a single-batch or single-phase implementation plan before code changes.

## Inputs

- batch name / phase name
- user goal
- current repository state
- AGENTS.md rules

## Steps

1. Read `AGENTS.md`.
2. Identify whether the request is for a batch or a detailed phase.
3. Inspect only the files relevant to the requested scope.
4. Infer the current commands from `packages/package.json`.
5. Create or update:
   - `plans/<batch-or-phase>/Plan.md`
   - `plans/<batch-or-phase>/Implement.md`
6. In `Plan.md`, include:
   - goal
   - non-goals
   - milestones
   - acceptance criteria per milestone
   - validation commands per milestone
   - backward-compatibility notes
   - known risks / open questions
7. In `Implement.md`, include:
   - source of truth = `Plan.md`
   - milestone execution order
   - stop-and-fix rule
   - expected files to touch
   - scope guardrails
8. Keep milestones small enough to complete in one implementation loop.
9. Do not modify product code unless the user explicitly asked for planning + execution in the same run.

## Output

Produce:
- updated plan docs
- a short summary of scope, risks, and validations
