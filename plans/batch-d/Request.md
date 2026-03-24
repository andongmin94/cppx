/plan
Use $cppx-phase-plan first, then $cppx-phase-execute.

Repository: cppx
Batch: D — Phase 6

Work on exactly Batch D.

Goal:
- Enable native host support on Windows, macOS, and Linux.
- Keep scope limited to host-native flows.

User priorities to keep visible:
- cross-platform support is a core product goal
- support means native host build/run/test/pack on the three major desktop OSes
- do not over-claim full foreign-target cross-compilation support

In scope:
- darwin and linux adapters
- host-aware executable naming and path logic
- system compiler detection for macOS/Linux
- host-aware build/run/test/pack behavior
- 3-OS CI matrix and hello-world smoke coverage

Out of scope:
- no universal binary / notarization / remote toolchain work
- no full foreign-target run/test guarantees
- no GUI polish batch yet

Constraints:
- keep Windows behavior intact
- every new support claim must be validated
- do not begin Batch E
