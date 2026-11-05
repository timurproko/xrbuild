## Purpose

Define how ordinary and repository-development workspaces are selected and kept separate from the core, including the private embedded workspace and its tracked dependencies.

## ADDED Requirements

### Requirement: Workspace roots
A workspace SHALL remain a logical root distinct from the XR Build core, whether it is stored outside the core repository or tracked at the repository's `.xrbuild/` path. Every workspace SHALL use the same project, plugin, layout, dependency and output conventions, and core modules SHALL NOT import concrete workspace integrations.

#### Scenario: Embedded workspace
- **WHEN** the repository contains `.xrbuild/projects`, `.xrbuild/plugins` and the workspace package files
- **THEN** the panel and tools treat `.xrbuild/` as one ordinary workspace root and still treat the repository root as the core root

#### Scenario: Separate plugins
- **WHEN** the embedded workspace contains concrete display, input, platform, packager or publisher integrations
- **THEN** each integration remains a separate folder under `.xrbuild/plugins/` and core code reaches it only through the applicable neutral contract

### Requirement: User workspace resolution
Without an explicit workspace argument, the workspace SHALL be the folder named by `XRB_HOME` when it is set and `%USERPROFILE%\.xr-build` otherwise. The existence of `<repo>/.xrbuild/` SHALL NOT change this resolution.

#### Scenario: Ordinary user default
- **WHEN** a user starts the ordinary panel launcher with no `XRB_HOME`
- **THEN** the panel uses `%USERPROFILE%\.xr-build` even when the source checkout also contains `.xrbuild/`

#### Scenario: Environment override
- **WHEN** `XRB_HOME` names another workspace and no explicit workspace argument is given
- **THEN** the panel and workspace dependency command use the folder named by `XRB_HOME`

### Requirement: Explicit embedded workspace selection
The panel and workspace dependency tool SHALL accept an explicit workspace path. Repository-development entry points SHALL explicitly select `<current checkout>/.xrbuild/`, with the explicit path taking precedence over `XRB_HOME` and the default user workspace.

#### Scenario: Develop from the primary checkout
- **WHEN** the maintainer starts the repository-development panel from the primary checkout
- **THEN** the panel reports the primary checkout's `.xrbuild/` as its workspace

#### Scenario: Develop from a task worktree
- **WHEN** the maintainer starts the repository-development panel from a task worktree
- **THEN** the panel reports that task worktree's `.xrbuild/`, not the primary checkout's folder or a permanent `XRB_HOME`

### Requirement: Embedded workspace versioning
The embedded workspace SHALL be tracked by the repository's root Git history and SHALL NOT contain nested Git metadata. Source files, manifests, locks and pinned third-party dependencies SHALL be tracked, with binary dependencies stored through Git LFS. Credentials, signing material, installed packages, compiled plugin output and generated builds SHALL remain ignored.

#### Scenario: Import an existing workspace
- **WHEN** the maintainer copies an existing workspace to `.xrbuild/` without its `.git` directory
- **THEN** Git at the repository root reports its source and LFS pointer files as ordinary repository changes and reports no nested repository

#### Scenario: Build the embedded workspace
- **WHEN** projects and plugins in `.xrbuild/` are installed and built
- **THEN** installed packages, compiled binaries and generated output do not appear as tracked changes; pinned LFS dependencies remain tracked

#### Scenario: Fresh clone with LFS
- **WHEN** a maintainer clones the private repository with Git LFS installed
- **THEN** its tracked third-party files materialize at `.xrbuild/third_party/` and match their pinned hashes without requiring external source checkouts

### Requirement: Private workspace naming boundary
The repository's core paths and file contents SHALL satisfy the neutral-name policy. The name guard SHALL exempt paths and contents beneath `.xrbuild/` as private workspace material. Core code SHALL NOT depend on private integration identities, and credentials or signing material SHALL NOT be tracked in the private workspace.

#### Scenario: External names in private workspace
- **WHEN** a private project, plugin path or pinned dependency under `.xrbuild/` contains an external identifier
- **THEN** the core name guard permits it without affecting the plugin's runtime behavior

#### Scenario: Prohibited name outside private workspace
- **WHEN** a tracked path or core file outside `.xrbuild/` contains a prohibited name
- **THEN** the name guard rejects it

#### Scenario: Plugin supplies a user-facing label
- **WHEN** a private plugin declares a product-specific label
- **THEN** the panel displays that label without requiring the core to embed a product-specific constant

### Requirement: Local catalog in an embedded project preview
When the panel serves an embedded launcher project's browser preview, the launcher SHALL list available apps from that panel's selected workspace, without requiring the production publication inventory. A published launcher SHALL continue to read its configured publication inventory.

#### Scenario: Production inventory is unavailable during local preview
- **WHEN** a local browser preview opens while the production inventory is missing
- **THEN** its cards show eligible apps from the selected workspace and launch through local panel preview routes

#### Scenario: Published catalog
- **WHEN** the launcher runs at its published origin
- **THEN** it lists routes from the publisher-owned inventory and does not use the development panel API
