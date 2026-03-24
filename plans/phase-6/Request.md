/plan
Use $cppx-phase-plan first, then $cppx-phase-execute.

Repository: cppx
Phase: 6 — macOS/Linux native host support

Work on exactly Phase 6.

Goal:
- Enable native host build/run/test/pack on Windows, macOS, and Linux.
- Do not attempt full foreign-target cross-compilation.

User priorities to keep visible:
- cross-platform support means native host usability on the three major desktop OSes
- support claims should be backed by CI or smoke validation
- Windows behavior must remain intact while macOS/Linux support is added

In scope:
- darwin adapter
- linux adapter
- host-aware executable naming and tool resolution
- system compiler detection for macOS/Linux
- CI matrix across `windows-latest`, `macos-latest`, `ubuntu-latest`
- hello-world native smoke coverage

Out of scope:
- no universal binary, notarization, mobile, embedded, or remote toolchain support
- no full foreign-target run/test guarantees

Constraints:
- success means native host flows work on the three major hosts
- keep Windows behavior intact
- be explicit about what remains unsupported
