# Finish merged tasks through guarded completion

## Why

The shared Worktrees instruction says to detach only when asked or when switching tasks. It says nothing about what to do after a verified merge, so an agent may run worktree cleanup while its session is still attached to the task checkout. In another repository that removed part of the attached checkout and left every built-in tool of the session failing before execution. On Windows the shell A1 starts for an attached session also pins the checkout directory, so cleanup issued from that session cannot finish.

A1 gains `a1 worktree complete`, which returns the session to the primary checkout before the repository's cleanup runs, and releases an attachment whose checkout is already gone. This repository's instructions should use it.

## What Changes

- Replace the shared Worktrees block with the version that keeps the task attached through review and uses `a1 worktree complete` after a verified merge instead of cleaning the attached checkout directly.
- State in the delivery skill's after-merge step that an attached A1 session finishes with `a1 worktree complete`, and that cleanup itself stays `pnpm worktree sweep --apply` with every private-workspace and `.artifacts/KEEP` protection unchanged.
- Commit the `.a1/worktree.json` declaration that lets completion run this repository's sweep, with no per-machine setup.
- Update the focused instruction test.

## Impact

Root agent instructions, the delivery skill, and their focused test. No product code, canonical spec, private workspace, or cleanup implementation changes. The instructions depend on an installed A1 release that provides `a1 worktree complete`; older releases may ignore the unknown command quietly, so this change must not be merged before that release is installed.
