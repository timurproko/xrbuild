# Spec Delta

## MODIFIED Requirements

### Requirement: One task, one worktree, branch and PR
A task SHALL use one `.worktrees/` checkout, `<type>/<short-desc>` branch from `origin/main`, and PR to `main` from plan to merge. The primary checkout SHALL stay on `main`. Before editing, the agent's entry point SHALL create or re-enter and confirm that task worktree's absolute path. An agent SHALL NOT edit another task's checkout or claim to change a running session's cwd when its runtime cannot do so.

#### Scenario: Two agents in parallel
- **WHEN** two agents work on two tasks at the same time
- **THEN** each works in its own worktree and branch, and neither changes the other's files or the primary checkout

#### Scenario: Failed worktree setup
- **WHEN** creating dependencies or entering a task worktree fails
- **THEN** the agent receives an actionable failure and does not continue editing in the primary checkout

### Requirement: PR body contract
A new linked draft SHALL have `## Proposal` (one or two sentences), `## Implementation` (two to five outcome checkboxes initially unchecked), and final collapsed `## Automation` with a valid link. On completion it SHALL add `## Acceptance` (one to ten plain outcome bullets) and check all Implementation items. Existing ready version-1 PRs with plain Implementation bullets SHALL retain their finalization path. One parser SHALL own the link fence.

#### Scenario: Linked PR
- **WHEN** a PR body holds a valid fence naming an active change
- **THEN** CI and trusted finalization treat the PR as delivering that change

#### Scenario: Malformed link
- **WHEN** the fence holds invalid JSON, an unknown version or a change id that is not a valid folder name
- **THEN** the delivery check fails with a message naming the problem

#### Scenario: Draft progress
- **WHEN** an agent completes a scoped implementation outcome and its code, tests and detailed task bookkeeping
- **THEN** it checks that PR body item without marking the PR ready or claiming maintainer acceptance

### Requirement: Finalization in the PR
Trusted automation SHALL promote a linked draft only with complete exact-head tasks, checked Implementation and valid Acceptance. It SHALL recheck identity, body, base and head before promotion; unfinished drafts remain draft and invalid completed drafts report blockers. The App SHALL finalize a ready linked PR in its branch by archiving the change, syncing and validating specs, pushing, and recording its link. Existing ready PRs retain the old path.

#### Scenario: Marked ready
- **WHEN** a linked PR with all tasks done is ready
- **THEN** a finalization commit by the App appears on the branch, the change folder is under `archive/`, the canonical specs include its deltas, and CI runs on the new head

#### Scenario: Completed draft
- **WHEN** a linked same-repository draft satisfies all readiness conditions at one unchanged head
- **THEN** the App marks it ready, the finalizer archives its change on that branch, and full CI runs on the finalized head

#### Scenario: Open tasks
- **WHEN** a linked ready PR's `tasks.md` contains unchecked tasks
- **THEN** no finalization commit is made and the run lists the open tasks

#### Scenario: Incomplete draft
- **WHEN** the exact head's `tasks.md` contains unchecked tasks
- **THEN** the draft remains draft and no finalization commit is made

#### Scenario: Stale snapshot
- **WHEN** the head or body changes while promotion is being validated
- **THEN** that run does not promote the changed candidate

#### Scenario: Already finalized
- **WHEN** a finalized PR gets another commit that does not bring the active change folder back
- **THEN** finalization makes no new commit
