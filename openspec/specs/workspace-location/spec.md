# workspace-location Specification

## Purpose
Define how ordinary and repository-development workspaces are selected and kept separate from the core, including the private embedded workspace and its tracked dependencies.

## Requirements

### Requirement: Workspace roots
A workspace SHALL remain a logical root distinct from the XR Build core, whether stored outside the core repository or independently cloned at the repository's ignored `.xrbuild/` path. Every workspace SHALL use the same project, plugin, layout, dependency and output conventions, and core modules SHALL NOT import concrete workspace integrations.

#### Scenario: Embedded workspace
- **WHEN** an authorized maintainer clones the private workspace at `<checkout>/.xrbuild/`
- **THEN** the panel and tools treat it as one ordinary workspace root and still treat the outer repository as the core root

#### Scenario: Separate plugins
- **WHEN** the private workspace contains concrete display, input, platform, packager or publisher integrations
- **THEN** each integration remains a separate folder under its `plugins/` and core code reaches it only through the applicable neutral contract

### Requirement: User workspace resolution
Without an explicit workspace argument, the workspace SHALL be the folder named by `XRB_HOME` when it is set and `%USERPROFILE%\.xrbuild` otherwise. The panel and workspace dependency command SHALL use the same default, and the existence of `<repo>/.xrbuild/` SHALL NOT change this ordinary resolution. The prior `%USERPROFILE%\.xr-build` workspace SHALL NOT be automatically migrated or deleted; it remains available through an explicit `XRB_HOME` override.

#### Scenario: Ordinary user default
- **WHEN** a user starts the ordinary panel launcher with no `XRB_HOME`
- **THEN** the panel uses `%USERPROFILE%\.xrbuild` even when the source checkout also contains `.xrbuild/`

#### Scenario: Dependency tool default
- **WHEN** a user fetches workspace dependencies with no `XRB_HOME` or explicit workspace path
- **THEN** the dependency tool uses `%USERPROFILE%\.xrbuild`

#### Scenario: Environment override
- **WHEN** `XRB_HOME` names another workspace and no explicit workspace argument is given
- **THEN** the panel and workspace dependency command use the folder named by `XRB_HOME`

#### Scenario: Existing legacy workspace
- **WHEN** `%USERPROFILE%\.xr-build` exists and `XRB_HOME` is unset
- **THEN** the ordinary default still selects `%USERPROFILE%\.xrbuild` without moving or deleting the old folder

### Requirement: Explicit embedded workspace selection
The panel and workspace dependency tool SHALL accept an explicit workspace path. Repository-development entry points SHALL explicitly select `<current checkout>/.xrbuild/`, with the explicit path taking precedence over `XRB_HOME` and the default user workspace. The repository SHALL provide a tool-installed **XR Build Dev** Start-menu entry that invokes the stable checkout's explicit repository launcher without replacing or changing the ordinary **XR Build** user-workspace shortcut.

#### Scenario: Develop from the primary checkout
- **WHEN** the maintainer starts the repository-development panel from the primary checkout
- **THEN** the panel reports the primary checkout's `.xrbuild/` as its workspace

#### Scenario: Develop from a task worktree
- **WHEN** the maintainer starts the repository-development panel from a task worktree
- **THEN** the panel reports that task worktree's `.xrbuild/`, not the primary checkout's folder or a permanent `XRB_HOME`

#### Scenario: Install the development shortcut
- **WHEN** the maintainer runs the development Start-menu installer from a stable checkout
- **THEN** Windows receives a distinct **XR Build Dev** shortcut that launches that checkout's `start-repo.vbs`, while **XR Build** continues to use the ordinary user workspace

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
When the panel serves a launcher project's browser preview, the launcher SHALL list available apps from that panel's selected project repository, without requiring the production publication inventory. A published launcher SHALL continue to read its configured publication inventory. The published inventory SHALL support both the publisher route-prefix root and named child routes; the launcher SHALL omit only its own canonical route and show every other valid published entry. Catalog cards SHALL use a valid same-origin manifest icon when available and otherwise use the finalized project favicon supplied by the browser build.

#### Scenario: Production inventory is unavailable during local preview
- **WHEN** a local browser preview opens while the production inventory is missing
- **THEN** its cards show eligible apps from the selected project repository and launch through local panel preview routes

#### Scenario: Published catalog
- **WHEN** the launcher runs at its published origin
- **THEN** it lists routes from the publisher-owned inventory and does not use the development panel API

#### Scenario: Launcher published at the route-prefix root
- **WHEN** the inventory contains the launcher at `/apps/` with an empty slug and other apps at named child routes
- **THEN** the launcher omits its own root entry and shows every valid named app instead of reporting the library unavailable

#### Scenario: Launcher published at a named route
- **WHEN** the launcher runs at `/apps/launch/` and the inventory also contains a root publication and other named apps
- **THEN** it omits only `/apps/launch/` and shows the root and remaining named publications

#### Scenario: App has no manifest icon
- **WHEN** a published app has no usable same-origin icon in its web manifest
- **THEN** its catalog card uses the finalized `xrb-app-icon.png` from that app's published route

### Requirement: Separate project repository
The panel SHALL accept an explicit project repository root independently from the selected integration workspace.
`--projects=<path>` SHALL take precedence over `XRB_PROJECTS_HOME`; when neither is present the project root SHALL
default to the selected workspace for backward compatibility. The project root SHALL own `projects/`,
`xrb-panel.json`, app package-workspace files and generated editor configuration. The integration workspace SHALL
continue to own plugins, integration dependencies, package output and machine-local state. The panel SHALL report
both resolved roots and SHALL NOT require either repository to be nested inside the other.

#### Scenario: Sibling public app checkout
- **WHEN** the panel starts with a private integration workspace and an explicit sibling project repository
- **THEN** it lists and edits projects from the sibling checkout while loading plugins and package output from the private workspace

#### Scenario: Backward-compatible workspace
- **WHEN** no explicit project root or `XRB_PROJECTS_HOME` is set
- **THEN** the selected workspace remains both the project root and integration workspace

#### Scenario: Explicit path wins
- **WHEN** `XRB_PROJECTS_HOME` names one checkout and `--projects=<path>` names another
- **THEN** the explicit argument is the project root and the panel reports that choice

### Requirement: Launcher catalog runtime modes

The launcher SHALL treat only loopback browser origins as development previews. A launcher hosted by the native app runtime or at a published web origin SHALL read the configured publisher-owned inventory, retain each app's canonical published route, omit its own configured publication identity and show no synthetic empty slots. A loopback panel preview MAY use the selected project repository and a loopback development server MAY substitute local built routes; synthetic empty slots SHALL remain limited to those loopback environments.

#### Scenario: Native desktop mirrors published catalog

- **WHEN** the built launcher runs at a non-loopback native app origin
- **THEN** it shows the same valid publisher-owned entries as the published browser launcher and opens their canonical published URLs

#### Scenario: Native root omits launcher

- **WHEN** the native launcher is hosted at `/` and its path cannot identify its publication route
- **THEN** its compiled publication identity removes only its own inventory entry

#### Scenario: Published browser omits launcher

- **WHEN** the launcher runs at its named published route
- **THEN** path and publication identity filtering omit the launcher while retaining every other valid publication

#### Scenario: Test slots are loopback-only

- **WHEN** the launcher runs in a panel preview or separate development server on `localhost` or `127.0.0.1`
- **THEN** test-only empty slots may be appended for catalog layout testing

#### Scenario: Product runtime has no test slots

- **WHEN** the launcher runs in the native app runtime or from a published HTTPS origin
- **THEN** no synthetic empty slot is shown, including when the real inventory is unavailable

### Requirement: Launcher pointer presentation

The launcher SHALL support its existing mouse and hand interactions without rendering the SDK's spatial mouse cursor ring in the scene. Other applications and the SDK cursor capability SHALL remain unchanged.

#### Scenario: Mouse control without cursor ring

- **WHEN** a desktop user moves and clicks the mouse over launcher cards or page controls
- **THEN** the controls retain their hover, press and activation behavior without a separate white or blue spatial ring flashing over the catalog

#### Scenario: Hand interaction remains available

- **WHEN** the launcher receives supported hand input
- **THEN** card and page controls remain interactive after the launcher-specific mouse cursor object is removed

### Requirement: Independent task workspace ownership
Core task worktrees SHALL NOT automatically share the primary private workspace through a link or shared dependency tree. Private development MAY use an independently provisioned task-local clone. Core worktree cleanup SHALL refuse to discard a nested private repository through an outer clean-status check alone.

#### Scenario: Task-local private changes
- **WHEN** a task has its own private workspace clone
- **THEN** explicit repository-development commands select that task's workspace and private edits do not modify the primary clone

#### Scenario: Cleanup with nested Git repository
- **WHEN** a clean core worktree still contains an independently versioned private workspace
- **THEN** automated core cleanup refuses removal until the private clone has been preserved and handled separately
