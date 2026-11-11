# Verification

The root Worktrees block now keeps the task attached through review and directs agents to `a1 worktree complete` after a verified merge instead of cleaning the attached checkout. The delivery skill's after-merge step says the same, names the one-time local `a1.worktreeCleanup` setting that runs this repository's sweep, states what completion does without it, and repeats that sweep's merged-and-clean rule and private-data protections are unchanged.

Local checks passed:

- Focused instruction regression test: one test passed, including the exact new block, the after-merge completion step, the sweep setting, and the existing setup, private/KEEP preservation, and merge-authority assertions.
- Name guard: no banned names (27 hashes).
- Strict `guard-worktree-completion` validation: passed.
- `git diff --check`: passed.

No product, private workspace, cleanup implementation, or canonical specifications changed.

Known gaps:

- `a1 worktree complete` was not run against this repository; the instructions depend on an installed A1 release that provides it. Older releases may ignore the unknown command quietly, so this change must not be merged before that release is installed.
- The `a1.worktreeCleanup` setting is documented, not written; each machine owner sets it once.
- Existing sessions must load or be given the new guidance.

Remote CI and maintainer integration are not claimed by these local checks.
