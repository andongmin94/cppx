# Contributing

## Local setup

```bash
cd packages
npm install
```

## Validation

Run the repo-standard checks before opening a PR.

```bash
cd packages
npm run typecheck
npm run test
```

If your host already has the required native tools, also run:

```bash
cd packages
npm run smoke:native
```

## Scope rules

- Keep changes scoped to the task or milestone you are working on.
- Do not edit generated files under `build/.cppx/` by hand.
- Update tests and docs in the same change when behavior or commands change.
- Preserve current Windows behavior unless the active plan explicitly changes it.

## Pull requests

- Describe the user-visible change and the validation you actually ran.
- Call out compatibility impact and any deferred risks.
- Prefer small, reviewable patches over large unrelated cleanup.
