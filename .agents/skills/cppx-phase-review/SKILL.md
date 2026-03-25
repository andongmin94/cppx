---
name: cppx-phase-review
description: Use when asked to review a completed cppx batch or phase diff or prepare it for merge. Focus on regression risk, missing tests, backward compatibility, documentation drift, and whether the change leaked into another batch.
---

You are the review workflow for cppx roadmap work.

## Review checklist

1. Read `AGENTS.md`.
2. Read the matching `Plan.md` and `Implement.md`.
3. Compare the diff to the active batch boundary.
4. Check whether:
   - scope stayed inside the target batch or phase
   - validations were actually run
   - backward compatibility was preserved where promised
   - tests and docs were updated where needed
   - renderer work was avoided unless explicitly in scope
5. Call out:
   - hidden regressions
   - missing validation coverage
   - architecture drift
   - follow-up work that belongs to the next batch, not this one

## Output

Report:
- what looks solid
- what is risky
- what must be fixed before merge
- what should be deferred to a later batch
