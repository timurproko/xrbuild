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
