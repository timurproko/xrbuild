# Design

Use the same shared Worktrees block as A1 so both repositories state one lifecycle: stay attached through implementation and review; after a verified merge run `a1 worktree complete`; never clean the attached checkout directly; plain detach keeps files and branches.

Completion in A1 only detaches and then runs a command the machine owner configured in the primary repository's local Git configuration. A1 deletes nothing itself. For this repository that command is the existing sweep, run without a shell from the primary checkout:

`git config --local a1.worktreeCleanup "node tools/worktree/worktree.mjs sweep --apply"`

Sweep keeps its current rules: it removes only merged, clean worktrees and preserves any task holding `.xrbuild/` or `.artifacts/KEEP` as dirty. Completion adds no selector and no new authority, and the sweep report it relays is authoritative. Without the setting, completion detaches, keeps the checkout, and reports that cleanup is unavailable; the next session's `pnpm worktree sweep --apply` remains the cleanup path. The setting is local to a machine and is documented, not written by this change.

Completion refuses to detach while the outer checkout has uncommitted or untracked content. It does not look inside ignored paths, so an ignored private clone does not block the detach; sweep's own private-data protection still decides removal.

The instruction test requires the complete new block, keeps rejecting the old detach-on-finish rule and inventory gates, requires the after-merge completion step, and retains the existing setup, private-data, cleanup, and merge-authority assertions. This instruction-only change uses `skip_specs: true`.

## Prerequisite

A separate A1 delivery adds `a1 worktree complete` and invalid-attachment recovery. This change is implemented only after the maintainer approves the plan, and merged only after an A1 release containing that command is installed.
