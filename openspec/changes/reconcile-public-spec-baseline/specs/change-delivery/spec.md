## MODIFIED Requirements

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

## ADDED Requirements

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
