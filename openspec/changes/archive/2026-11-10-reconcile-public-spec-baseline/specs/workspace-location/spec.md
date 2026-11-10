## MODIFIED Requirements

### Requirement: Workspace roots
A workspace SHALL remain a logical root distinct from the XR Build core, whether stored outside the core repository or independently cloned at the repository's ignored `.xrbuild/` path. Every workspace SHALL use the same project, plugin, layout, dependency and output conventions, and core modules SHALL NOT import concrete workspace integrations.

#### Scenario: Embedded workspace
- **WHEN** an authorized maintainer clones the private workspace at `<checkout>/.xrbuild/`
- **THEN** the panel and tools treat it as one ordinary workspace root and still treat the outer repository as the core root

#### Scenario: Separate plugins
- **WHEN** the private workspace contains concrete display, input, platform, packager or publisher integrations
- **THEN** each integration remains a separate folder under its `plugins/` and core code reaches it only through the applicable neutral contract

### Requirement: Embedded workspace versioning
The development workspace at `.xrbuild/` SHALL be an independent private Git clone ignored as a whole by the core, not a submodule, symlink or junction. Its own history SHALL version plugin source, projects when not separately selected, manifests, locks and pinned dependencies, with binaries stored through Git LFS. Credentials, signing material, installed packages, compiled output and generated builds SHALL remain ignored. Separate project repositories SHALL retain exclusive ownership of their app source and package metadata.

#### Scenario: Core staging
- **WHEN** an authorized maintainer edits a file inside the nested private workspace and stages ordinary core changes
- **THEN** core Git does not stage the workspace file or its nested Git metadata

#### Scenario: Import an existing workspace
- **WHEN** a maintainer imports existing integration files into the private workspace repository
- **THEN** that repository tracks their source and LFS pointers while the core ignores the entire nested workspace

#### Scenario: Build the embedded workspace
- **WHEN** projects use plugins from the nested private integration workspace
- **THEN** installed packages, compiled binaries and generated output remain ignored in both repositories while pinned dependencies stay tracked privately

#### Scenario: Private workspace commit
- **WHEN** an authorized maintainer commits private integration changes
- **THEN** the commit belongs only to the workspace repository and not to core history

#### Scenario: Private integrations with public projects
- **WHEN** the selected project repository is distinct from the private integration workspace
- **THEN** project source and app package metadata are tracked only in the selected project repository

#### Scenario: Fresh public clone
- **WHEN** a user clones the public core without private-repository credentials
- **THEN** the core has no tracked private workspace files or private LFS download requirement and ordinary user-workspace mode remains usable

#### Scenario: Fresh clone with LFS
- **WHEN** an authorized maintainer separately clones the private workspace with Git LFS
- **THEN** its pinned integration binaries materialize under that workspace using its own attributes and LFS storage

## ADDED Requirements

### Requirement: Independent task workspace ownership
Core task worktrees SHALL NOT automatically share the primary private workspace through a link or shared dependency tree. Private development MAY use an independently provisioned task-local clone. Core worktree cleanup SHALL refuse to discard a nested private repository through an outer clean-status check alone.

#### Scenario: Task-local private changes
- **WHEN** a task has its own private workspace clone
- **THEN** explicit repository-development commands select that task's workspace and private edits do not modify the primary clone

#### Scenario: Cleanup with nested Git repository
- **WHEN** a clean core worktree still contains an independently versioned private workspace
- **THEN** automated core cleanup refuses removal until the private clone has been preserved and handled separately
