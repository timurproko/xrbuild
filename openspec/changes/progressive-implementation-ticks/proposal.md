## Why

PR task progress is the maintainer's live view of an implementation, but agents write every outcome in one pass and
tick all items together at the end. The instructions state what a tick means, not when to make it; task groups do
not follow the PR outcomes; nothing asks for a commit per outcome; and plans schedule PR ticking as a last task.

## What Changes

- Add one shared `Implementation progress` paragraph to `AGENTS.md`: one task group per outcome, one outcome at a
  time, and a PR-body tick right after that outcome's push and before the next one starts.
- Load `AGENTS.md` from `.claude/CLAUDE.md` so every agent runtime reads that same paragraph, and replace the
  separate progress wording in the instructions, delivery skill and PR template with a reference to it.
- Pin the paragraph and its single ownership with the agent-guidance test.

## Impact

Repository instructions, the delivery skill, the PR template, the change-delivery specification and one test. No
automation, readiness, finalization, CI or merge-authority change: `tasks.md` must still be complete before
promotion, and nothing new blocks a push or a checkbox. The paragraph is identical to the one the agent runtime's
own repository adopts in its separate pull request.
