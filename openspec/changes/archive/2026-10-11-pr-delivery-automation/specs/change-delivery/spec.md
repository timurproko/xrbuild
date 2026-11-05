# Spec Delta

## Purpose

How a change travels through the core repo: from a task in its own worktree, through a plan the maintainer approves,
to one PR whose squash merge brings code, synced specs and the archived OpenSpec change to `main` together.

## ADDED Requirements

### Requirement: Delivery skill
The repo SHALL hold the delivery process for agents in one skill at `.claude/skills/change-delivery/SKILL.md`, and
`.claude/CLAUDE.md` and `openspec/config.yaml` SHALL point to it. The skill SHALL cover worktree setup, plan-first
drafts, implementation after approval, finalization, handoff and cleanup.

#### Scenario: Agent starts a task
- **WHEN** an agent is asked to deliver a change in the core
- **THEN** it loads the skill and follows it without further instructions on branch, worktree or PR handling

### Requirement: One task, one worktree, branch and PR
A task SHALL be delivered from its own worktree under `.worktrees/`, on its own `<type>/<short-desc>` branch from
`origin/main`, through one PR to `main` that stays the same from plan to merge. The primary checkout SHALL stay on
`main`. An agent SHALL NOT edit in another task's worktree.

#### Scenario: Two agents in parallel
- **WHEN** two agents work on two tasks at the same time
- **THEN** each works in its own worktree and branch, and neither changes the other's files or the primary checkout

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
A PR body SHALL have `## Proposal` (one or two sentences), `## Implementation` (two to five bullets), `## Acceptance`
(one to ten plain bullets, added when the implementation is complete) and a final `## Automation` section holding, in a
collapsed block, an `openspec-implementation` fence with JSON `{"version":1,"change":"<change-id>"}` when the PR
implements an OpenSpec change. The PR template SHALL carry these sections, and one parser SHALL read and rewrite the
fence.

#### Scenario: Linked PR
- **WHEN** a PR body holds a valid fence naming `pr-delivery-automation`
- **THEN** CI and the finalization workflow treat the PR as delivering that change

#### Scenario: Malformed link
- **WHEN** the fence holds invalid JSON, an unknown version or a change id that is not a valid folder name
- **THEN** the delivery check fails with a message naming the problem

### Requirement: Finalization in the PR
When a non-draft PR to `main` links a change whose tasks are all done, a workflow running as the repo's GitHub App
SHALL archive the change in the PR branch (`openspec archive <change> --yes`, specs synced), validate OpenSpec, commit
`docs(openspec): finalize <change>`, push, and record the archive path and commit in the fence. A PR whose linked
change has open tasks SHALL NOT be finalized, and the run SHALL list the open tasks.

#### Scenario: Marked ready
- **WHEN** the maintainer or agent marks a linked PR with all tasks done as ready
- **THEN** a finalization commit by the App appears on the branch, the change folder is under `archive/`, the specs
  under `openspec/specs/` include its deltas, and CI runs on the new head

#### Scenario: Open tasks
- **WHEN** a linked PR is marked ready while `tasks.md` has unchecked tasks
- **THEN** no commit is made and the run names the unchecked tasks

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
