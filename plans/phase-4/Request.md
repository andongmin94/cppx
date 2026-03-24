/plan
Use $cppx-phase-plan first, then $cppx-phase-execute.

Repository: cppx
Phase: 4 — dependency backend abstraction

Work on exactly Phase 4.

Goal:
- Break the hard coupling to vcpkg.
- Introduce backend abstraction for `vcpkg`, `conan`, and `none`.

User priorities to keep visible:
- `vcpkg` must remain supported for existing users
- `conan` should become a first-class selectable backend shape
- plain CMake projects should be possible without forcing a package manager backend

In scope:
- backend interface
- project generator/backend wiring
- add command behavior by backend
- minimal viable Conan integration shape
- `backend = none` support for plain CMake projects

Out of scope:
- no macOS/Linux host enablement
- no preset matrix completion
- no GUI workflow expansion

Constraints:
- keep current vcpkg behavior working
- move backend-specific generation logic out of generic project logic
- tests must cover backend selection and backward compatibility
