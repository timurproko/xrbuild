# Spec Delta

## MODIFIED Requirements

### Requirement: Agent session worktree context
Before task edits, an agent SHALL create or re-enter its registered worktree and bind its canonical absolute root to the active session. In A1, the agent SHALL use `a1 session link-worktree <absolute-path>` and confirm `a1 session worktrees` displays that same path and branch as `current`. Linking SHALL NOT grant cleanup or merge authority or adopt another task's checkout. Resume and task switching SHALL revalidate the native link; failure SHALL block task edits.

#### Scenario: New task from primary checkout
- **WHEN** an agent receives a delivery request while the primary checkout is on `main`
- **THEN** it creates an isolated branch and worktree, links that exact absolute root with the native session command, and confirms the displayed current branch and path while `main` stays unchanged

#### Scenario: Draft PR appears
- **WHEN** the linked task's draft PR is created
- **THEN** the same worktree remains the native current session context, while the PR number is recorded through GitHub and handoff metadata rather than a project-specific session status

#### Scenario: Resume or switch tasks
- **WHEN** the session resumes or the agent explicitly switches to another delivery
- **THEN** it natively links and displays the exact intended worktree before editing; a stale, busy or mismatched path is not presented as current

#### Scenario: Link cannot be established
- **WHEN** the native command is unavailable, the worktree is foreign or invalid, another live session owns it, or the displayed current entry does not match
- **THEN** the agent reports the blocker and makes no task edit in the primary checkout or an unrelated worktree
