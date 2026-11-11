# Design

Replace only the detach-on-finish instruction in the shared Worktrees block. Keep the task attached through implementation completion and review handoff so follow-up work retains its checkout and PR. Detach remains available when explicitly requested or switching tasks, and runtime shutdown releases editing claims automatically.

The runtime already supports this behavior; the defect is the agent policy, not an implementation-completion event. No cached stale PR identity or second claim mechanism is introduced. Dependency installation, independent private provisioning, private/KEEP cleanup protection, and merge authority remain unchanged.

The focused guidance test requires the complete corrected block, rejects the old detach-on-finish rule across active instruction entry points, and retains the existing setup, ownership, cleanup, and integration-authority assertions. This instruction-only correction uses `skip_specs: true`; no canonical product specification changes are needed.

The maintainer requested this correction in both repositories after approving the attachment-continuity fix. The maintainer subsequently authorized committing these changes and opening a PR under this repository's Git instructions. Integration remains a separate maintainer decision.
