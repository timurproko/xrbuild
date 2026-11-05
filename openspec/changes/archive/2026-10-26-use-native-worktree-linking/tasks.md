# Tasks

## 1. Native delivery guidance

- [x] 1.1 Update `AGENTS.md` and the change-delivery skill to create or re-enter the task checkout, run `a1 session link-worktree <absolute-path>`, and require `a1 session worktrees` to show the exact path and branch as current before edits; verify a fresh-task, resume and task-switch walkthrough all stop on an unavailable or mismatched native link.
- [x] 1.2 Remove the custom PR-number refresh and project-extension fallback instructions while retaining absolute-path operations, primary-checkout protection and maintainer-only merge authority; verify a repository search finds no delivery instruction that tells A1 agents to use `task_worktree`, `/task-worktree`, extension reload or the plain-Pi launcher.

## 2. Remove duplicate integration

- [x] 2.1 Delete the project `.pi` worktree extension and the repository session-context helper and tests it owns; verify tracked project resources contain no custom worktree-link tool, transcript entry, status renderer, PR lookup or tool-call gate.
- [x] 2.2 Delete the plain-Pi task launcher and remove its test coverage while preserving generic worktree enter, Claude Code entry, sweep and handoff behavior; verify `node --test` in `tools/worktree` passes and still covers those retained paths.

## 3. Delivery verification

- [x] 3.1 Exercise an active A1 session by linking the task worktree's absolute root and confirming the native inventory marks only that path and branch current, then run the worktree tests, name guard and strict OpenSpec validation; verify all checks pass without touching the primary checkout or another task worktree.
