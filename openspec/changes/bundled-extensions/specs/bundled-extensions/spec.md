## ADDED Requirements

### Requirement: Equivalent embedded and user workspace structure
The product SHALL support a core-owned embedded workspace at `<core>/embedded/` and a separately selected user workspace using the same root-relative plugin, project, dependency, manifest and configuration schemas. Both roots SHALL support `plugins/<id>/`, `projects/<section>/<id>/` and archived projects. The embedded workspace SHALL belong to core Git history without nested Git metadata. An authorized repository-development `.xrbuild/` clone SHALL remain independently versioned and ignored by core; ordinary user workspaces SHALL NOT require Git or private credentials.

#### Scenario: Public-only checkout
- **WHEN** a user has the public repository and an empty ordinary workspace without private access
- **THEN** embedded plugins and projects are available and no private clone or private dependency download is required

#### Scenario: Equivalent project and plugin manifests
- **WHEN** equivalent reviewed manifests are supplied under embedded and user roots
- **THEN** the same schema validation and neutral plugin/project contracts apply while ownership and write destinations remain distinct

#### Scenario: Explicit repository development
- **WHEN** a repository launcher is invoked from a task worktree
- **THEN** it combines that worktree's embedded catalog with that worktree's independently provisioned `.xrbuild` rather than the primary private clone

### Requirement: Unified origin-aware discovery
The panel and build tools SHALL use resolved extension records carrying origin, identity, canonical source root, owning install root, binary/output roots and writable state scope. Native providers, metadata, packagers, publishers, managed tools, samples, dependency selection, freshness and packaging SHALL resolve a plugin consistently. Paths SHALL remain contained within explicitly authorized roots after real-path resolution.

#### Scenario: Two plugin origins
- **WHEN** distinct embedded and user plugins are enabled
- **THEN** both appear with their origins and all consumers use the matching metadata, modules and binaries

#### Scenario: Managed tool escapes its root
- **WHEN** a tool module resolves outside its authorized plugin root through traversal or a link
- **THEN** loading is rejected instead of accepting arbitrary files merely because a second workspace root exists

#### Scenario: Cross-plugin service declaration
- **WHEN** one plugin declares a service supplied by another component
- **THEN** resolution validates the declared component ownership and selected origin without unchecked sibling-path imports

### Requirement: Explicit conflict resolution
Catalog instances SHALL have origin-qualified identities while retaining compatible unqualified logical IDs when unambiguous. Built-in provider IDs SHALL remain reserved. Conflicting plugin, service, provider role/name or tool-route identities SHALL NOT silently shadow or combine implementations. Ambiguous integrations SHALL be unavailable until an explicit valid source selection resolves the conflict. Selection SHALL apply coherently to the entire integration.

#### Scenario: Same plugin in both roots
- **WHEN** embedded and user roots contain the same logical plugin identity without a source preference
- **THEN** the panel reports both origins and prevents ambiguous activation rather than selecting by scan order

#### Scenario: Explicit workspace implementation
- **WHEN** the user selects the workspace implementation of a duplicated plugin
- **THEN** its metadata, tools, services and binaries are selected together and preferences/caches do not alias the embedded instance

#### Scenario: Duplicate runtime provider across different folders
- **WHEN** two selected plugins advertise the same runtime role and name
- **THEN** the conflict is diagnosed before panel-managed launch even if their folder IDs differ

### Requirement: Embedded projects and writable user projects
The project catalog SHALL distinguish embedded and user project identities, including matching folder names. Normal panel operations SHALL NOT mutate tracked embedded project sources or product-default configuration. Editable copies SHALL be created explicitly in the selected project repository. New projects SHALL default to that writable root. User overrides, layout, publication/signing state and recordings SHALL remain outside embedded sources.

#### Scenario: Same project name
- **WHEN** an embedded project and user project share a folder name
- **THEN** both remain separately addressable and editing or archiving the user project cannot affect the embedded project

#### Scenario: Customize a bundled project
- **WHEN** a user requests an editable copy of an embedded project
- **THEN** the panel creates an independent project in the writable project root without inheriting deployment credentials or a live publication identity

#### Scenario: Read-only product installation
- **WHEN** the embedded workspace is read-only
- **THEN** catalog/preview/run operations use packaged artifacts and writable user state, and any requested rebuild uses a writable output root without rewriting product source

#### Scenario: Separate project repository
- **WHEN** an explicit project repository is selected independently from the user integration workspace
- **THEN** new and copied projects belong to that project repository while embedded source and private integration ownership remain unchanged

### Requirement: Isolated dependency and build ownership
The embedded package workspace and its lockfile SHALL be versioned by core, and core setup/build/test entry points SHALL explicitly orchestrate it. External package workspaces SHALL remain independently installed and excluded from core package globs and public CI. Native builds SHALL use origin-correct dependencies and isolated outputs. Package artifacts SHALL contain only selected distributable runtime files.

#### Scenario: Build bundled modules without private assets
- **WHEN** public CI installs and builds the embedded workspace
- **THEN** it uses reviewed public dependencies and tests without private workspace credentials, proprietary runtimes or physical devices

#### Scenario: Optional plugin unavailable
- **WHEN** an optional plugin lacks its toolchain or device runtime
- **THEN** its availability is reported without preventing a generic core-only build or desktop execution

#### Scenario: Package selected providers
- **WHEN** a project selects providers from the resolved catalog
- **THEN** packaging copies the selected origin's allowed runtime files, not both implementations, entire source roots, Git metadata or local state

### Requirement: Audited source promotion
Moving workspace material into the public embedded workspace SHALL require an explicit per-module source/asset allowlist, confidentiality and redistribution review, neutral public configuration, focused tests and approval of the public export. Private Git ancestry SHALL NOT be imported. Client-facing projects and related assets SHALL remain private. Destination intent SHALL NOT substitute for content review.

#### Scenario: Mixed public and restricted functionality
- **WHEN** a candidate plugin contains generic UI or synthetic behavior together with a restricted native adapter/runtime
- **THEN** only the independently reviewed public component may be embedded and the restricted component remains external behind a neutral contract

#### Scenario: Archived non-client project
- **WHEN** a reviewed archived project is promoted
- **THEN** its archive placement is preserved and private provider defaults, deployment state and machine settings are excluded or externalized

#### Scenario: Uncertain client ownership
- **WHEN** the client-project path or asset ownership is not confirmed
- **THEN** export of that material is blocked and it remains private

#### Scenario: Retire old private copy
- **WHEN** a reviewed embedded replacement is available
- **THEN** retirement of its private predecessor is delivered independently after compatibility checks without deleting local overrides or merging private history into public history
