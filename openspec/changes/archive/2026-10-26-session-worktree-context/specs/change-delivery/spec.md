# Spec Delta

## ADDED Requirements

### Requirement: Agent session worktree context
Before task edits, an agent SHALL create or re-enter its registered worktree and link its canonical path and branch to the active session. Interactive status SHALL show that branch and its exact open PR number when known. Linking SHALL NOT change tool cwd, grant cleanup/merge authority or adopt another task's checkout. Resume SHALL revalidate the link; failure SHALL leave the session visibly unbound and block task edits until a valid link succeeds.

#### Scenario: New task from primary checkout
- **WHEN** an agent receives a delivery request while the primary checkout is on `main`
- **THEN** it creates an isolated branch and worktree, links that exact path before planning edits, and visibly shows its branch while `main` stays unchanged

#### Scenario: Draft PR appears
- **WHEN** the linked task's draft PR is created or the session refreshes its context
- **THEN** the status shows that same branch and the matching PR number without changing cwd or marking the PR ready

#### Scenario: Resume or switch tasks
- **WHEN** the session resumes or the agent explicitly switches to another delivery
- **THEN** it validates and links the exact intended worktree before editing; a stale or mismatched path is not presented as active

#### Scenario: Link cannot be established
- **WHEN** a worktree is foreign, unregistered, owned by another task or the session integration is unavailable
- **THEN** the agent reports the blocker and makes no task edit in the primary checkout or that unrelated worktree
