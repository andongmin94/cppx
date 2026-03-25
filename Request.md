/plan Read `Plan.md` first, then `Implement.md`, and execute the root plan exactly.

Repository: cppx
Plan: Cross-Platform Host Parity

Work only within the scope of the root plan.

Goal:
- make macOS and Linux reach Windows-level practical parity for host setup and tool management
- keep the Cargo-like project workflow consistent across hosts
- provide safe install, update/repair, and remove flows where the host is officially supported
- back parity claims with CI and documentation

Why this plan exists:
- current cross-platform support is stronger at the workflow layer than at the host-tooling layer
- Windows has the richest managed path today
- macOS/Linux still depend too much on preinstalled system tools
- tool removal and ownership-aware lifecycle handling are not yet first-class product features

In scope:
- official host support matrix definition
- tool lifecycle capability and ownership model
- managed macOS path using Homebrew
- managed Ubuntu path using `apt`
- managed `vcpkg` and `conan` parity on supported hosts
- CLI/GUI lifecycle parity
- CI/docs/release wording updates for the declared host matrix

Out of scope:
- arbitrary Linux distro parity
- visual redesign
- package marketplace UX
- auto-update
- signing/notarization
- broad workspace/model redesign

Constraints:
- preserve existing workflow command semantics unless explicitly extended by the plan
- keep Windows behavior at least as capable as today
- use conservative uninstall rules
- do not claim parity beyond the supported host matrix
- run validations after each milestone and fix failures before moving on

Final output requirements:
- list changed files
- summarize key design decisions
- report validation results
- explain compatibility impact
- note remaining risks or deferred work
