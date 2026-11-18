# change-delivery Specification

## Purpose
How a change travels through the core repo: from a task in its own worktree, through a plan the maintainer approves,
to one PR whose squash merge brings code, synced specs and the archived OpenSpec change to `main` together.

## Requirements

### Requirement: Worktree sweep and handoff
`pnpm worktree handoff <name>` SHALL record the worktree's branch, change, PR and head commit in its `.artifacts/` and
print the handoff report skeleton (worktree, branch and PR, commit, commands run, behaviour, gaps, one manual test
command). `pnpm worktree sweep` SHALL list every task worktree as `dirty`, `active`, `merged`, `closed` or `unknown`, and
with `--apply` SHALL remove only `merged` worktrees with a clean tree. A `closed` worktree SHALL be removed only by
`remove --discard`.

#### Scenario: After a merge
- **WHEN** a task's PR has merged and its worktree is clean
- **THEN** `pnpm worktree sweep --apply` removes it and its local branch

#### Scenario: Uncommitted work
- **WHEN** a worktree has uncommitted changes
- **THEN** sweep reports it as `dirty` and never removes it

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

### Requirement: Embedded workspace in task worktrees
Each task that needs private integration files SHALL provision its own independent workspace clone at that worktree's ignored `.xrbuild/` path. The worktree helper SHALL share only fetched core dependencies and SHALL NOT link private workspace dependencies or build output from the primary checkout. Cleanup SHALL refuse to remove a worktree containing a private workspace or an explicit artifact-preservation marker, even when outer Git status is clean.

#### Scenario: Edit an embedded plugin in a task
- **WHEN** an agent changes a plugin in the linked task's independent `.xrbuild/` clone
- **THEN** the primary workspace files and generated plugin output remain unchanged and private commits belong to the task's workspace clone

#### Scenario: Reuse fetched workspace dependencies
- **WHEN** the primary checkout has fetched entries in `.xrbuild/third_party/` and a core task worktree is created
- **THEN** the worktree helper does not link those entries; private dependencies are provisioned independently only when needed

#### Scenario: Remove a merged worktree
- **WHEN** a clean merged worktree still contains `.xrbuild/` or an `.artifacts/KEEP` marker
- **THEN** automated cleanup preserves it until the maintainer separately preserves the private data and resolves the protection

### Requirement: Accepted public contract checkpoint
A canonical specification baseline missing after an accepted public bootstrap MAY be reconciled through an independently reviewed contract-only change. The maintainer SHALL explicitly approve this disposition before implementation. The checkpoint SHALL bind its requirements to accepted public implementation evidence, review relevant predecessor contracts in their recorded order, preserve current compatible canonical behavior and leave historical plans and task completion unchanged. Its own implementation tasks SHALL be fully verified before the normal trusted bot synchronizes and archives that checkpoint change. The checkpoint SHALL NOT waive finalization checks, assert unfinished historical acceptance or authorize private exports, hosting changes, cleanup or merges.

#### Scenario: Historical plan has unfinished operational tasks
- **WHEN** an accepted public contract needs canonical synchronization but its historical plan still contains unverified migration, device or companion-delivery tasks
- **THEN** an explicitly approved checkpoint can document the verified public contract through its own normal bot-finalized PR while the original plan and unverified tasks remain unchanged and outside the checkpoint's completion claims

#### Scenario: Successor requires the missing canonical target
- **WHEN** a successor modifies a capability established by the checkpoint
- **THEN** its canonical prerequisite remains unresolved until the checkpoint is bot-finalized and maintainer-merged, and the successor retains normal modified-requirement, scenario-preservation, finalization and exact-head CI checks

#### Scenario: Unapproved checkpoint or unverified source
- **WHEN** checkpoint approval is absent or a proposed requirement relies on unmerged code, private content or unobserved acceptance
- **THEN** the requirement cannot be declared an accepted baseline and no historical task is marked complete to bypass that blocker

### Requirement: Delivery is delegated to the shared workflow
Pull-request delivery SHALL be performed by the shared delivery workflow that this repository calls from one caller workflow containing no steps of its own. Draft promotion, OpenSpec finalization, the delivery check, ready pull-request refresh and merged-branch deletion SHALL NOT be implemented or re-checked by scripts, workflows or CI jobs in this repository. Agent instructions SHALL name the shared delivery skill as the owner of the delivery rules and SHALL keep only rules that are specific to this repository.

#### Scenario: A pull request is updated
- **WHEN** a pull request into the default branch is opened, edited, pushed, marked ready, converted to draft or closed
- **THEN** the caller workflow invokes the shared delivery workflow for that event
- **AND** no workflow in this repository promotes, finalizes or validates the delivery itself

#### Scenario: A repository-specific rule is needed
- **WHEN** a delivery rule applies only to this repository, such as private workspace preservation
- **THEN** it is stated in the agent instructions here and does not restate the shared rules
