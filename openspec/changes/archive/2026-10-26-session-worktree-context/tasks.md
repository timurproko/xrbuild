# Tasks

## 1. Session binding

- [x] 1.1 Add a canonical task-worktree link operation that creates or re-enters the exact branch, validates Git repository/worktree identity and keeps the previous link on failure; verify with worktree tests for new, resumed, foreign, colliding and dirty unrelated checkouts.
- [x] 1.2 Persist the active session's link without writing tracked files and revalidate it on resume or task switch; verify with session-state tests for stale paths, aliases and multiple sessions.

## 2. Visible agent context

- [x] 2.1 Add a trusted project agent integration that links the current session before planning edits, displays its branch and the exact open PR when available, and reports an unbound state on failure without claiming to change tool cwd; verify with integration fixtures for session start, new draft, re-link and non-interactive mode.
- [x] 2.2 Align `AGENTS.md`, the delivery skill and worktree entry points around the required create-and-link checkpoint and same-PR continuation; verify by loading the agent context from the primary checkout and checking the printed bound path before editing a disposable task worktree.

## 3. Delivery checks

- [x] 3.1 Run worktree/session tests, name guard and strict OpenSpec validation, and exercise a primary-checkout agent session through worktree link and draft-PR discovery without changing `main`; verify the session displays the intended branch and PR while its tool commands still use worktree paths explicitly.
