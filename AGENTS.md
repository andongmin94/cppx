## Execution plans

When a task references `PLANS.md`, read it before making changes.

For any multi-file, multi-step, or architecture-affecting task:
- follow the priority order in `PLANS.md`
- do not start a lower-priority workstream while a higher-priority one is incomplete
- make small, reviewable changes
- when behavior changes, update docs and tests in the same pass
- run relevant validation commands before finishing
- end with: files changed, commands run, results, remaining risks, and the next recommended step