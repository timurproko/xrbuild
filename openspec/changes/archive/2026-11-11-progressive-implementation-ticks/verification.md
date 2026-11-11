## Delivered

- `AGENTS.md` holds the `Implementation progress` paragraph; `.claude/CLAUDE.md` imports `../AGENTS.md` and its Git
  bullet refers to the paragraph instead of separate wording.
- The delivery skill plans one task group per outcome with no ticking or handoff task, implements per outcome by
  reference to the paragraph, and no longer restates progress rules in its checks bullet. The PR template comment
  points to the same paragraph.
- This delivery followed the rule: each of its two outcomes was pushed in its own commit and ticked before the next.

## Focused checks

- `node --test` for `tools/worktree/agent-guidance.test.mjs`, `tools/worktree/repository-task.test.mjs`,
  `tools/pr-automation/docs-auto-merge.test.mjs` and `tools/pr-automation/pr-body.test.mjs` passed.
- `pnpm check:names`, strict validation of `progressive-implementation-ticks` and `git diff --check` passed.

## Gaps

- The rule is guidance: no automation rejects ticks made together, so its effect shows in PR history, not in a check.
- Sessions that loaded the old instructions keep them until restarted; task worktrees created before the merge keep
  the old files until they merge `main`.
- Remote CI, bot finalization and the merge remain with trusted automation and the maintainer.
