# change-delivery Specification

## Purpose
How a change travels through the core repo: from a task in its own worktree, through a plan the maintainer approves,
to one PR whose squash merge brings code, synced specs and the archived OpenSpec change to `main` together.

## Requirements

### Requirement: Delivery skill
The repo SHALL hold the delivery process for agents in one skill at `.claude/skills/change-delivery/SKILL.md`, and
`.claude/CLAUDE.md` and `openspec/config.yaml` SHALL point to it. The skill SHALL cover worktree setup, plan-first
drafts, implementation after approval, finalization, handoff and cleanup.

#### Scenario: Agent starts a task
- **WHEN** an agent is asked to deliver a change in the core
- **THEN** it loads the skill and follows it without further instructions on branch, worktree or PR handling

### Requirement: One task, one worktree, branch and PR
A task SHALL use one `.worktrees/` checkout, `<type>/<short-desc>` branch from `origin/main`, and PR to `main` from plan to merge. The primary checkout SHALL stay on `main`. Before editing, the agent's entry point SHALL create or re-enter and confirm that task worktree's absolute path. An agent SHALL NOT edit another task's checkout or claim to change a running session's cwd when its runtime cannot do so.

#### Scenario: Two agents in parallel
- **WHEN** two agents work on two tasks at the same time
- **THEN** each works in its own worktree and branch, and neither changes the other's files or the primary checkout

#### Scenario: Failed worktree setup
- **WHEN** creating dependencies or entering a task worktree fails
- **THEN** the agent receives an actionable failure and does not continue editing in the primary checkout

### Requirement: Plan before code
A PR for an OpenSpec change SHALL start as a draft holding only the change's planning artifacts. The agent SHALL NOT add
implementation until the maintainer approves the plan and asks for the implementation explicitly; it SHALL then continue
in the same worktree, branch and PR, and update the plan before the code it covers.

#### Scenario: Plan awaiting approval
- **WHEN** the agent has pushed the plan and the maintainer has not answered
- **THEN** the draft PR holds no implementation and the agent has handed off

#### Scenario: Request mixing plan and implementation
- **WHEN** a single request asks for a plan and its implementation without saying the plan needs no review
- **THEN** the agent delivers the plan only and asks for approval

### Requirement: PR body contract
A new linked draft SHALL have `## Proposal` (one or two sentences), `## Implementation` (at least two outcome checkboxes initially unchecked, with two to five recommended for readability), and final collapsed `## Automation` with a valid link. Trusted promotion SHALL NOT impose a maximum number of otherwise valid Implementation outcomes. On completion the PR SHALL add `## Acceptance` (one to ten plain outcome bullets) and check all Implementation items. Existing ready version-1 PRs with plain Implementation bullets SHALL retain their finalization path. One parser SHALL own the link fence.

#### Scenario: Linked PR
- **WHEN** a PR body holds a valid fence naming an active change
- **THEN** CI and trusted finalization treat the PR as delivering that change

#### Scenario: Malformed link
- **WHEN** the fence holds invalid JSON, an unknown version or a change id that is not a valid folder name
- **THEN** the delivery check fails with a message naming the problem

#### Scenario: Draft progress
- **WHEN** an agent completes a scoped implementation outcome and its code, tests and detailed task bookkeeping
- **THEN** it checks that PR body item without marking the PR ready or claiming maintainer acceptance

#### Scenario: Detailed implementation checklist
- **WHEN** a completed linked draft has more than five valid checked Implementation outcomes
- **THEN** trusted promotion accepts the checklist rather than blocking solely because it exceeds the recommended count

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

### Requirement: Finalization runs no PR code
The finalization workflow SHALL use only `main`'s copy of its workflow and scripts and the pinned OpenSpec CLI on the
PR's files, and SHALL NOT install dependencies from or run code in the PR's tree.

#### Scenario: PR changes a package script
- **WHEN** a linked PR changes `package.json` scripts or the finalization script itself
- **THEN** finalization runs `main`'s script and none of the PR's scripts

### Requirement: Delivery check
CI SHALL fail a non-draft PR that links a change still active at its head, whose fence is malformed, or that changes
files of an active change folder other than through its linked and finalized change, unless the PR has the
`openspec-in-progress` label. The check SHALL read the finalized state from the head's files and SHALL run from the
base commit's copy of its script.

#### Scenario: Awaiting finalization
- **WHEN** a linked PR is ready but the finalization commit has not been pushed yet
- **THEN** the delivery check fails with "awaiting finalization"

#### Scenario: Unlinked plan
- **WHEN** a ready PR adds an active change folder without linking it
- **THEN** the delivery check fails and says to link the change or keep the PR in draft

### Requirement: Maintainer merges
Agents and automation SHALL NOT merge a PR that links a change, arm its auto-merge or push to `main`. Only the
maintainer merges such a PR.

#### Scenario: Validated linked PR
- **WHEN** a linked PR is finalized and CI is green
- **THEN** it stays open until the maintainer merges it

### Requirement: Documentation auto-merge
A ready same-repo PR to `main` that changes only documentation (`docs/`, `openspec/`, Markdown outside `.claude/` and
`.github/`), does not link a change, touches no active change folder and has no `no-auto-merge` label SHALL get squash
auto-merge armed with the App's token, so its merge starts CI on `main`. Auto-merge armed by the automation SHALL be
removed when the PR stops qualifying; auto-merge armed by a person SHALL be kept.

#### Scenario: Docs fix
- **WHEN** a ready PR changes only `README.md`
- **THEN** it merges by itself once `CI required` passes, and a CI run starts on `main`

#### Scenario: Plan only
- **WHEN** a PR adds only an active change folder
- **THEN** it is not auto-merged

### Requirement: Unarchived change report
A nightly workflow SHALL list every active change on `main` that a merged PR links, in one open issue labelled
`openspec-reconcile` that it updates in place and closes when the list is empty.

#### Scenario: Merged without archive
- **WHEN** a PR linking `x` merged while `openspec/changes/x/` stayed active
- **THEN** the next nightly run lists `x` in the reconcile issue

### Requirement: Agent scratch folder
Each worktree SHALL have a git-ignored `.artifacts/` folder for agent scratch (PR bodies, logs, patches, captured
output). Agents SHALL NOT write scratch to the system temp folder, the user's home, the primary checkout or another
worktree.

#### Scenario: PR body
- **WHEN** an agent opens a PR
- **THEN** it writes the body to `.artifacts/` in its worktree and passes it with `--body-file`, and the file is never
  committed

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

### Requirement: Implementation progress while implementing
`AGENTS.md` SHALL hold one `Implementation progress` paragraph that every agent runtime loads; other guidance SHALL refer to it. A linked change's `tasks.md` SHALL hold one task group per PR Implementation outcome, in the same order. The agent SHALL deliver one outcome at a time: write its code and tests, tick its tasks, commit and push, then tick that outcome in the PR body before starting the next.

#### Scenario: Several outcomes
- **WHEN** an approved plan has several Implementation outcomes
- **THEN** each outcome is ticked after its own pushed commit and before work on the next one starts

#### Scenario: Outcome awaits only CI or a device
- **WHEN** an outcome's code and tests are written and pushed but CI or manual device acceptance has not run
- **THEN** the agent ticks the outcome without waiting and reports the unobserved part as a gap

#### Scenario: Defect after a tick
- **WHEN** a ticked outcome later needs a fix
- **THEN** the fix is a new commit in the same PR

#### Scenario: Any agent runtime
- **WHEN** an agent loads the repository's instructions through `AGENTS.md` or `.claude/CLAUDE.md`
- **THEN** it receives the same single progress paragraph

#### Scenario: Plan tasks
- **WHEN** an agent writes a linked change's `tasks.md`
- **THEN** it has no task for ticking PR outcomes or handing off

#### Scenario: Single owner
- **WHEN** `.claude/CLAUDE.md`, the delivery skill or the PR template mention implementation progress
- **THEN** they refer to the `AGENTS.md` paragraph and do not restate it
