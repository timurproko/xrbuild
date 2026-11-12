# XR Build agent work

Generic engine code and approved public modules under `embedded/` belong to the core PR. `embedded/` is core-owned, not another repository; it shares plugin/project layouts with the selected user workspace. Private-only work belongs to a private PR, without an empty public PR. Paired work needs separate PRs and a private/local handoff; never expose private repository links, source inventories or client details in public artifacts. Public promotion requires separately approved, audited snapshots, never private history. Use `pnpm task:repos` with ignored local configuration for explicit routing/provisioning and exact tested-revision handoffs; it grants no export, delivery or cleanup permission. Follow the active change's prerequisite order and leave spec synchronization/archive to the repository bot.

The ignored `.xrbuild/` folder is an independent private workspace clone, not part of core Git history, a submodule or a junction. Follow the Workspace section of `.claude/CLAUDE.md`, the private clone's `CLAUDE.md` and each affected plugin's instructions. Change private files only in the task's independently provisioned clone inside its linked worktree. Never clean up a worktree containing private workspace data or an `.artifacts/KEEP` preservation marker.

Before planning or changing this repository, read `.claude/CLAUDE.md` and `.claude/skills/change-delivery/SKILL.md`. Keep the primary checkout on `main`. The delivery skill owns repository setup, private-data preservation, cleanup and PR delivery; attachment grants no cleanup or merge authority. Only the maintainer chooses when to merge implementation PRs.

## Implementation progress

Plan `tasks.md` as one task group per PR `## Implementation` outcome, in the same order. Then work one outcome at a time: write its code and tests, tick its `tasks.md` tasks, commit and push, and tick that outcome in the PR body (`[ ]` to `[x]`, nothing else) before starting the next one. A tick means the code and tests are written: CI, broad test runs, and manual validation never delay it, and a later defect is fixed in a new commit. Never save ticks for handoff.

## Worktrees

In an active A1 session, use `a1 worktree enter <branch>` or `a1 worktree attach <absolute-path>`. Work in the returned directory; success is the attachment confirmation. Keep the task attached after implementation completion and review handoff so follow-up fixes retain its checkout and PR. After a verified merge, run `a1 worktree complete`: it returns the session to primary before repository cleanup runs, so never clean the attached checkout directly. Use `a1 worktree detach` only when explicitly requested or switching tasks; it preserves files and branches. Runtime shutdown releases claims automatically. A1 owns coordination, retries, and recovery; `a1 worktree list` is informational. Outside A1, use ordinary Git worktrees.
