# Tasks

## 1. Worktree ownership

- [x] 1.1 Make worktree creation/re-entry idempotent and failure-safe, resolve absolute registered paths, reject name collisions and mismatched task branches, and use the pinned package manager through Corepack when needed; verify with worktree tests for clean creation, reuse, collisions and dependency-install failure recovery.
- [x] 1.2 Add supported agent entry points for Claude Code worktree creation and Pi task-cwd launch/connection, with instructions that forbid edits before the exact worktree is bound; verify in tests with a task created from the primary checkout and an existing task re-entered without changing `main`.

## 2. Track implementation completion

- [x] 2.1 Update the PR template and delivery skill for draft implementation checkboxes, detailed `tasks.md` progress, plain acceptance outcomes and implementation-only readiness; verify parser/policy tests accept a complete body, reject incomplete or malformed bodies, and preserve already-ready legacy PRs.
- [x] 2.2 Distinguish required automated verification from optional maintainer-only acceptance without falsely ticking unchecked work, and keep agents from marking linked PRs ready or merging them; verify with policy fixtures for incomplete work, declared device-only gaps and completed code/tests.

## 3. Promote and validate

- [x] 3.1 Add a trusted same-repository draft promoter that reads the exact PR head as data, validates its body and tasks, and rechecks identity and SHA immediately before the App marks it ready; verify with tests for stale heads/bodies, foreign forks, unchecked tasks, malformed links and a complete eligible draft.
- [x] 3.2 Wire promoter events into the existing ready-triggered finalizer and full CI without executing PR-supplied scripts or granting bot merge authority; verify workflow fixtures, a hermetic draft -> ready -> finalization -> exact-head delivery/CI-gate wiring test, and an incomplete-draft refusal. Live promotion on a PR opened after this policy merges is follow-up acceptance, not a checkbox dependent on merged code.
