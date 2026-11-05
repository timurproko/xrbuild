## ADDED Requirements

### Requirement: Embedded workspace in task worktrees
When the repository tracks `.xrbuild/`, each task worktree SHALL use its own checked-out embedded workspace sources. The worktree helper MAY share the primary checkout's ignored `.xrbuild/third_party/` entries through safe links, but SHALL keep plugin builds, binaries, installed packages, project output and package output isolated in the task worktree.

#### Scenario: Edit an embedded plugin in a task
- **WHEN** an agent changes a plugin under the linked task worktree's `.xrbuild/plugins/`
- **THEN** the primary checkout's tracked workspace files and generated plugin output remain unchanged

#### Scenario: Reuse fetched workspace dependencies
- **WHEN** the primary checkout has fetched entries in `.xrbuild/third_party/` and a task worktree is created
- **THEN** the worktree helper links those entries into the task worktree without copying them or linking any build output

#### Scenario: Remove a merged worktree
- **WHEN** a clean merged task worktree with linked embedded dependencies is removed through the worktree tool
- **THEN** only the links are removed and the primary checkout's dependency files remain intact
