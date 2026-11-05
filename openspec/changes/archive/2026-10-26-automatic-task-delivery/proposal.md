# Proposal

## Why

Today an agent can mark an implementation PR ready before its tasks are finished. Finalization then refuses to archive it, leaving Delivery and the required check red. The existing worktree command also creates a checkout but does not bind an agent session to it; a hook for one agent runtime would not automatically fix other runtimes.

## What Changes

- Track coarse implementation outcomes as checkboxes in the draft PR body, alongside detailed `tasks.md` entries. Check each item only after its code, tests and task bookkeeping are done; keep manual device/browser acceptance distinct from implementation completion. Do not infer completion from CI or silently check tasks.
- Trusted automation promotes a linked draft only after checking the exact PR head, complete PR checklist, completed `tasks.md`, and final acceptance bullets. The existing finalizer then archives and pushes the change on that same branch, which triggers ordinary exact-head CI. Failure leaves the PR draft and explains the blocker. Preserve the existing finalization and delivery path for PRs created before this contract (including an already-ready PR).
- Establish an explicit task-worktree entry point for each supported agent runtime. Reuse only the matching task worktree; create a new one from `origin/main` otherwise, refuse unrelated or dirty work, and bind the session's working directory to the absolute path before edits. Claude Code can use its worktree hook; Pi needs a worktree-cwd-aware launch or session integration rather than assuming that Claude hooks change its cwd. Fix partial worktree creation when dependency installation fails.
- Keep implementation PRs maintainer-merged only. CI success makes the candidate merge-eligible; neither readiness automation nor the agent chooses to merge.

## Capabilities

### Modified Capabilities
- `change-delivery`: worktree/session ownership, implementation task progress, trusted draft promotion and legacy compatibility.
- `ci-validation`: promote only after completion; preserve lightweight drafts and exact-head ready validation.

## Impact

Delivery instructions and PR template, worktree helper and agent integration, trusted PR automation and tests, finalization workflow, and CI's draft/ready behavior. No change to project runtime, private workspace, publishing or `main` integration authority.
