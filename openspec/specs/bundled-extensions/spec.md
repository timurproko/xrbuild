# bundled-extensions Specification

## Purpose
Define the accepted public embedded-module baseline: common workspace contracts, origin-aware discovery, immutable installed defaults, user-owned state, isolated builds and explicitly reviewed public promotion. Workflow restoration remains a separate successor.

## Requirements

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
- **THEN** a #alias reference resolves only a declared export of its explicitly qualified selected enabled owner, validates contained regular unlinked modules for both origins, and retains the declaring plugin's configuration identity without unchecked sibling-path imports

#### Scenario: Automatic coherent discovery
- **WHEN** preferences, catalog declarations or installed runtime selection changes outside the UI
- **THEN** idle discovery refreshes publisher/packager implementations together and invalidates dependent caches, while busy refresh blocks new consumers and existing consumers retain pinned implementations

#### Scenario: Changed executing module code
- **WHEN** an already-executed module or dependency changes in its existing namespace
- **THEN** new consumers require an actual panel restart instead of importing cached old code under new metadata, while arbitrary runtime JSON changes do not falsely count as executable changes

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

#### Scenario: Resolve plugin source in the UI
- **WHEN** the user selects an installed bundled or workspace source using the current catalog/preferences/declaration revision
- **THEN** the whole plugin is selected, publisher/packager services refresh together while conflicting work is excluded, unrelated preferences survive atomic locked saving, source-dependent caches are invalidated and no failed implementation falls back to the previous source

#### Scenario: Stale source selection or executing tool identity
- **WHEN** a source choice has a stale revision or conflicts with active launch/service/job preparation, or changes the identity of an existing tool runtime
- **THEN** stale/overlapping source updates are rejected without overwriting preferences, and a changed tool is invalidated and requires restart rather than executing the previous source under the new metadata

### Requirement: Embedded projects and writable user projects
The project catalog SHALL distinguish embedded and user project identities, including matching folder names. Embedded projects SHALL support the same capability-based development, settings, rename, icon, run, build, package, publication and organization operations as user projects without requiring an independent copy. Deletion SHALL be the only restriction based solely on embedded project origin, enforced both at HTTP boundaries and direct operation entry points. Normal operations SHALL NOT mutate installed embedded sources or product-default configuration. Mutable manifests, editable working sources, icons, publication/signing state and recordings SHALL use durable contained user-owned state, scoped by canonical installation, selected workspace, selected project repository and qualified logical project identity. Discovery SHALL NOT initialize working sources or install dependencies. Effective manifest saves SHALL compare complete content-bound revisions, including not-yet-imported personal settings, and use cooperating-writer locks with atomic replacement so equal timestamps do not allow stale edits. New independent projects and optional explicit copies SHALL default to the selected writable project repository.

#### Scenario: Normal embedded project actions
- **WHEN** a user develops, changes settings or name/icon, runs, builds, packages or publishes a valid embedded app with the necessary ordinary capabilities and configuration
- **THEN** the action uses a validated effective project and writable user-owned state without requiring Copy to workspace or modifying installed defaults

#### Scenario: Same-timestamp stale editor
- **WHEN** another writer changes effective settings without changing the observable file timestamp
- **THEN** a stale manifest revision is refused without losing the newer settings or writing a partial manifest

#### Scenario: Same project name
- **WHEN** embedded and user projects share a folder name
- **THEN** settings, sources, output, organization and deployment identity remain separately addressable, and operations on either project do not affect the other

#### Scenario: Legacy editable project reference
- **WHEN** a request uses an unqualified project ID
- **THEN** it addresses only the selected editable project repository, while qualified embedded references resolve the effective embedded project and its archive membership without creating duplicate identities

#### Scenario: Embedded deletion
- **WHEN** an embedded project is deleted through the UI, HTTP API or a direct panel operation, whether live, archived or not yet initialized
- **THEN** deletion is refused without removing product files or user state, while deletion of an ordinary same-name project retains normal behavior

#### Scenario: Writable alias into product source
- **WHEN** an operation reaches an installed product file through a linked root, asset, manifest, layout or build-state path
- **THEN** it is rejected before modifying the product file regardless of displayed origin

#### Scenario: Packaged preview without source writes
- **WHEN** an embedded project has valid packaged output and no conflicting effective local build state and is previewed or run in built mode
- **THEN** the panel may read contained packaged output without installing dependencies or rewriting it, and launch configuration and other mutable state remain user-owned

#### Scenario: Customize a bundled project
- **WHEN** the user explicitly chooses to create a separate copy of an embedded project
- **THEN** it becomes an independent ordinary project in the selected writable repository without inheriting credentials or a live deployment identity, and this action is not a prerequisite for using the original embedded project

#### Scenario: Read-only product installation
- **WHEN** the embedded installation is read-only
- **THEN** normal supported project workflows remain available using contained user-owned effective sources, settings and outputs

#### Scenario: Restart and installed source update
- **WHEN** the panel restarts or installed defaults change after a user edits an embedded project
- **THEN** durable user sources/settings and deployment identity are preserved, and any incompatible source-baseline change, including an installed default-section relocation, is reported for explicit non-destructive reconciliation instead of overwriting edits or silently resetting defaults

#### Scenario: Separate project repository
- **WHEN** a project repository is selected independently from the integration workspace
- **THEN** effective embedded project state and organization are isolated for that selection, while ordinary projects and private integration ownership remain unchanged

### Requirement: Personal bundled run settings
The panel SHALL preserve existing scoped personal input/display/monitor/fullscreen/projection/camera choices for unmaterialized bundled projects without changing product defaults. Legacy records SHALL retain bounded field/schema validation, source ownership, revision-checked atomic saves and cooperating-writer exclusion. Invalid, oversized, linked or foreign records SHALL block their consumption without replacement or echoing saved contents. The first explicit preparation of durable effective project state SHALL import validated personal choices once into the normal effective manifest and run defaults while preserving the original record. Subsequent normal project edits SHALL take precedence; the legacy run-settings API SHALL NOT become a second conflicting editor for a materialized project. Materialized projects SHALL use the same ordinary editable manifest/provider configuration rules as user projects, with normal user-owned persistence rather than restrictions to the legacy run-override field list.

#### Scenario: Save and restore personal choices
- **WHEN** an unmaterialized project's legacy personal settings are explicitly saved or restored using the current revision
- **THEN** only its contained user-owned record changes, product defaults remain unchanged, and a later effective manifest imports the resulting validated choices only once

#### Scenario: Defaults or another writer changed
- **WHEN** product defaults, selected provider ownership/schema or another settings writer changes the revision before a legacy save or first preparation
- **THEN** stale or incompatible choices are refused without overwriting newer user data, and settings already imported into an effective manifest are not silently replaced

#### Scenario: Schema-bound advanced provider choices
- **WHEN** an unmaterialized project reads, saves or imports legacy advanced provider choices
- **THEN** the choices remain bound to the actual selected provider owner/schema and its declared boolean, number or select fields, while materialized projects subsequently use normal manifest configuration rules

#### Scenario: Settings during active use
- **WHEN** legacy settings saving or effective settings preparation conflicts with an active run, build, package, publication, icon job or another writer
- **THEN** the conflicting action is refused or serialized without changing the active consumer's selected settings or creating a second legacy editor for a materialized project

#### Scenario: Existing personal choices before preparation
- **WHEN** the user opens or runs an unmaterialized embedded project with valid saved personal choices
- **THEN** its normal controls and launch snapshot reflect those choices without rewriting product defaults or initializing editable sources during discovery

#### Scenario: One-time import and subsequent edits
- **WHEN** an explicit writable action first prepares an embedded project and the user later changes normal project settings
- **THEN** validated legacy choices initialize the effective settings once, subsequent edits remain authoritative across reloads, and the legacy record is preserved rather than reapplied over those edits

#### Scenario: Invalid personal state
- **WHEN** an unmaterialized project's legacy settings are malformed, oversized, linked, foreign, stale or have an incompatible selected provider schema
- **THEN** their consumption or conflicting save is refused with a user-state recovery location, without silently replacing the file or weakening its old validation

#### Scenario: Scope survives user organization
- **WHEN** the user moves or archives an embedded project before materialization
- **THEN** its existing source-bound legacy settings and cached output remain addressable while the stable logical identity and new effective state are independent of user section/archive placement

### Requirement: Explicit cached bundled project rebuilds
The panel SHALL expose supported embedded project development and build scripts through normal project actions without modifying installed sources or implicitly installing user/private workspace packages. An explicit source-consuming action SHALL prepare or reuse contained durable user-owned working inputs using the pinned manager and validated frozen public dependency graph, and SHALL build declared transitive local prerequisites in order. Unsupported dependency configuration SHALL produce an actionable preparation failure rather than silently installing an ambient workspace or making an independent project copy a workflow prerequisite. Installation lifecycle hooks SHALL remain disabled for managed public snapshot preparation. Successful finalized builds SHALL publish checked immutable output generations with atomic receipts bound to installation, effective source/settings and output content. Development, runs, icon jobs, packaging and publication SHALL consume coherently resolved effective project snapshots. Durable working sources and configuration SHALL NOT be treated as disposable build cache. These checks SHALL NOT be described as a sandbox or export audit.

#### Scenario: Rebuild through the bundled detail view
- **WHEN** the user builds an embedded app through the normal Develop or Build workflow
- **THEN** the panel starts an observable job using checked user-owned inputs, and successful output is available to native/browser runs, packaging and publication without rewriting installed files

#### Scenario: Development and source changes
- **WHEN** the user requests a declared development script or edits effective working sources
- **THEN** the normal development workflow uses the durable working tree, and restart/rebuild does not discard local edits

#### Scenario: Unsupported installation contract
- **WHEN** effective public inputs have unsupported package-manager configuration, invalid graph/lock links or escaping filesystem dependencies
- **THEN** preparation fails with the location and corrective requirement without installing surrounding user/private packages or modifying product sources

#### Scenario: Failed, stale or foreign local project state
- **WHEN** effective settings, source-baseline state or build receipts/output are invalid, incomplete, failed, stale, malformed, linked or bound to another project
- **THEN** the affected new action is blocked with a recovery diagnostic rather than automatically selecting packaged or older output, and original user data is preserved

#### Scenario: Existing cached consumers during another build
- **WHEN** a new build succeeds or fails after a browser/native consumer selected a successful generation
- **THEN** the existing consumer retains its validated reserved output and its generation-qualified assets remain available under the existing containment rules

#### Scenario: Overlapping project builders and launches
- **WHEN** incompatible project preparation, launches, builds, organization or settings changes overlap
- **THEN** the panel serializes or refuses conflicting actions, checks revisions before publication, and does not remove foreign locks or partially overwrite state

#### Scenario: Cache cleanup
- **WHEN** the user reviews and removes obsolete working build generations
- **THEN** durable effective sources, manifests, personal choices, publication/signing data, reserved generations and installed defaults remain intact

### Requirement: Explicit installed public service activation
Public service dependency installation and builds SHALL be explicitly requested, use fresh isolated frozen public embedded snapshots and never enroll user/private packages. Successful activation SHALL bind core/source, input content and installed output membership/stamps with atomic receipts and exclusive locks. Discovery SHALL NOT install. Existing local invalid/failed/stale/foreign state SHALL block new service/tool consumers without product/previous-source fallback, while the panel remains available for explicit recovery. Reserved and published snapshots SHALL remain intact for existing consumers. These checks SHALL NOT imply content signatures, a sandbox or redistribution approval.

#### Scenario: Activate services without product writes
- **WHEN** explicit CLI or panel setup installs and builds public services from read-only product files
- **THEN** selected factories/tools use the completed contained runtime, bundled tools do not prepare user/private packages implicitly, and product bytes remain unchanged

#### Scenario: Failed service state and recovery
- **WHEN** activation is building, failed, stale, foreign, linked or incomplete
- **THEN** new consumers refuse old-source fallback, the panel exposes recovery controls, and existing reserved/published snapshots remain preserved

#### Scenario: Runtime reservation races maintenance
- **WHEN** ordinary workspace operations advance after service builds but before activation completes
- **THEN** the service generation is reserved under the operation lock before release and cannot become a cleanup candidate during publication

### Requirement: Explicit reviewed working-cache cleanup
Cache maintenance SHALL be manual, scoped, revision-checked and limited to obsolete closed explicitly owned working generations. It SHALL exclude current work, reserved/published runtimes, unknown/foreign/incomplete state, user configuration/recordings and Git/private/KEEP-protected trees. It SHALL use cooperating builder locks, revalidated complete-tree membership/stamps and quarantine before deletion. It SHALL NOT remove worktrees/private clones, reclaim immutable runtimes, automatically reset failed state or remove stale locks.

#### Scenario: Review then confirm selected work
- **WHEN** a user reviews obsolete working generations and explicitly confirms selected current-review candidates
- **THEN** only those owned working directories are removed, while pinned browser/native/service runtime files and user configuration remain readable

#### Scenario: Changed or protected cleanup candidate
- **WHEN** receipt/tree ownership changes, another builder holds a lock, review is stale or a Git/private/KEEP/link entry appears
- **THEN** cleanup rejects or protects that state without deleting it, and a fresh explicit review is required

### Requirement: Isolated dependency and build ownership
The embedded package workspace and its lockfile SHALL be versioned by core, and core setup/build/test entry points SHALL explicitly orchestrate it. External package workspaces SHALL remain independently installed and excluded from core package globs and public CI. Native builds SHALL use origin-correct dependencies and isolated outputs. Package artifacts SHALL contain only selected distributable runtime files.

#### Scenario: Build bundled modules without private assets
- **WHEN** public CI installs and builds the embedded workspace
- **THEN** it uses reviewed public dependencies and tests without private workspace credentials, proprietary runtimes or physical devices

#### Scenario: Separate public package orchestration
- **WHEN** core setup/build/test entry points operate on the embedded package workspace
- **THEN** they install frozen fresh user-owned snapshots, validate unique explicit acyclic local dependency graphs and lockfile link destinations, build prerequisites before tests, and never enroll the private workspace or write installed product sources

#### Scenario: Missing, malformed or empty embedded workspace
- **WHEN** an embedded operation encounters an absent, malformed or empty product workspace
- **THEN** absence is skipped only when explicitly permitted, malformed/unsupported declarations fail before commands, and an empty scaffold reports zero packages rather than claiming module validation

#### Scenario: Untrusted or stale lockfile filesystem targets
- **WHEN** a lockfile importer or local resolution disagrees with the registered embedded package graph, or an installed link leaves the working generation
- **THEN** the operation fails before build/test scripts can consume that dependency, without rewriting the product lockfile or inspecting a surrounding workspace to repair it

#### Scenario: Failed or overlapping workspace operation
- **WHEN** an embedded setup/build/test operation fails, sees source changes or overlaps another cooperating writer
- **THEN** completion is not reported, exclusive operation locks are respected, retained working state remains inspectable, and diagnostic receipts do not authorize runtime activation or distribution

#### Scenario: Desktop package runtime inventory
- **WHEN** the built-in desktop packager stages a host app with selected plugins
- **THEN** the ZIP contains only allowlisted host/CEF files, checked built web assets, selected DLL/license files and explicitly inventoried plugin assets, excluding source/history/tests/debug output, unselected plugins and prohibited credential/machine state

#### Scenario: External adapter input boundary
- **WHEN** any panel package adapter is invoked
- **THEN** it receives isolated checked built-app, selected-runtime/plugin and portable configuration/identity snapshots rather than original source/build trees; WebXR receives no host/plugin tree, and repeated desktop staging preserves explicitly inventoried assets

#### Scenario: Unsafe or changed package inputs
- **WHEN** a package source/destination is linked, aliases another input, contains forbidden state, or changes during copying/archiving
- **THEN** the package fails without replacing existing caller folders or published versions, and incomplete staging remains inspectable

#### Scenario: Explicit portable plugin runtime assets
- **WHEN** a selected plugin declares extra runtime assets in its bounded versioned file inventory
- **THEN** contained unique regular files may be staged, while forbidden paths/state remain rejected and the inventory does not substitute for separate export/license approval

#### Scenario: Public hand-tracking dependencies
- **WHEN** reviewed embedded hand-tracking dependencies are fetched
- **THEN** they use pinned public sources and verified hashes/licenses/notices under `<core>/third_party/`, fetched binaries remain ignored, and unapproved components remain external

#### Scenario: Optional plugin unavailable
- **WHEN** an optional plugin lacks its toolchain or device runtime
- **THEN** its availability is reported without preventing a generic core-only build or desktop execution

#### Scenario: Rebuild the installed core host
- **WHEN** a managed full or core-only host rebuild is requested with a writable user workspace
- **THEN** CMake output stays in a canonical-core-scoped user cache, a successful runtime is published as an immutable snapshot, and product source/build trees remain unchanged

#### Scenario: Incomplete or changed host cache
- **WHEN** local host rebuild state exists but its receipt is missing, building, failed or foreign, or its published output is missing, linked or no longer matches its recorded membership/stamps
- **THEN** managed provider queries/runs/icons/packages/tests refuse that runtime without falling back to product-side binaries

#### Scenario: Host source freshness and stable consumers
- **WHEN** source membership/stamps change or a separate host rebuild publishes a new runtime
- **THEN** freshness detects the source change, including deletion of an older file, and consumers already using an earlier successful runtime retain its unchanged files

#### Scenario: Concurrent host builders
- **WHEN** independent processes rebuild the same core in the same selected workspace
- **THEN** an exclusive lock prevents concurrent toolchains, CMake resets do not move the lock, and an existing writer's lock is never automatically removed

#### Scenario: Rebuild embedded native plugin
- **WHEN** the user requests a plugins-only rebuild of an enabled embedded plugin
- **THEN** configuration uses the selected core SDK and origin-correct dependencies, and all generated build/runtime output goes to a core/source-scoped user workspace cache without rebuilding the installed host or writing embedded sources

#### Scenario: Incomplete native rebuild
- **WHEN** a native rebuild fails, remains in progress or has a receipt bound to another core/source
- **THEN** its partial output is unavailable and no packaged fallback silently replaces it until a successful matching rebuild

#### Scenario: Rebuild while native artifacts are in use
- **WHEN** a panel-managed native run is starting/running, or a package/icon job consumes native artifacts
- **THEN** a native rebuild cannot start concurrently, and a pending rebuild likewise prevents new native launches or package/icon jobs

#### Scenario: Package selected providers
- **WHEN** a project selects providers from the resolved catalog
- **THEN** packaging copies the selected origin's allowed runtime files, not both implementations, entire source roots, Git metadata or local state

### Requirement: User-owned plugin configuration defaults
Embedded plugins SHALL declare validated safe default configuration and store mutable user configuration only under the selected user workspace's `config/plugins/<plugin-id>/`. Discovery SHALL use validated in-memory defaults when configuration is absent without creating workspace folders or configuration files. Explicit configuration initialization SHALL create missing defaults without replacing existing files, including concurrent creators. Invalid existing configuration SHALL report a diagnostic, not be overwritten. Newly added missing fields MAY use validated in-memory defaults without rewriting existing user data. Link/path escapes SHALL be refused. Discovery SHALL NOT create credentials, signing keys or live production destinations.

#### Scenario: First and repeated startup
- **WHEN** a plugin's user configuration is absent and then the plugin is loaded again after the user explicitly creates or edits it
- **THEN** the first load uses validated defaults in memory without creating the selected root, and later loads preserve and use the user's file and values

#### Scenario: Invalid existing configuration
- **WHEN** the existing user config is malformed or points through an unsafe link
- **THEN** loading reports an actionable error without overwriting the config or falling back to a live deployment

#### Scenario: Concurrent first runs
- **WHEN** two explicit initialization operations attempt to create the same missing configuration
- **THEN** a complete valid configuration is visible and neither process replaces a file created or edited by the other

#### Scenario: Missing service workspace
- **WHEN** a public service factory is discovered before the selected user root exists
- **THEN** it may validate prospective user-owned paths and use in-memory defaults without creating them, while linked parents and product-source ownership violations remain refused

### Requirement: One publisher plugin with multiple destinations
Embedded publication SHALL use one plugin owning local and production destination services. Existing publisher service identities in project manifests SHALL remain compatible without requiring three independently installed plugin folders. Destination configuration, certificates and publication state SHALL remain user-owned. Production publication SHALL remain unavailable until explicitly configured and authorized.

#### Scenario: Unified plugin settings
- **WHEN** the user opens the embedded publisher's settings
- **THEN** one plugin exposes its local and production destinations while existing project service selections continue to resolve

#### Scenario: Existing workspace publishers
- **WHEN** legacy workspace publication plugins coexist with the embedded publisher
- **THEN** migration/conflict handling preserves their settings without silently activating duplicate implementations

### Requirement: Lowercase default project section
Both embedded and user workspaces SHALL use `projects/unsorted/` as the canonical unsectioned project location. Code, templates, tests and current documentation SHALL use this lowercase spelling consistently with other section folders. This naming update SHALL NOT introduce runtime migration or legacy-capitalization compatibility logic.

#### Scenario: New project
- **WHEN** a project is created without an explicit section
- **THEN** it is placed under lowercase `projects/unsorted/`

#### Scenario: Consistent section naming
- **WHEN** templates, project operations or current documentation refer to the unsectioned project directory
- **THEN** they use lowercase `projects/unsorted/` without special migration or legacy-alias handling

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

### Requirement: User-owned embedded project organization
Embedded projects SHALL participate in the same section list, project order and Projects/Archive tabs as user projects. User metadata SHALL override installed default section/archive placement without physically moving or deleting embedded folders. Reorder, section creation/rename/removal, move to Unsorted, archive and unarchive SHALL persist across panel restart. Organization SHALL retain qualified logical project, settings and deployment identity independent of section/archive placement. Layout HTTP updates SHALL require the current saved-state revision. Mixed-origin section operations SHALL validate all affected state and destinations before changes and preserve normal user-project folder semantics. Existing malformed or linked metadata SHALL report an error without silently replacing it.

#### Scenario: Mixed section
- **WHEN** the user moves an embedded app and an ordinary app into one named section and reorders them
- **THEN** both appear in that single section in saved order after restart, only the ordinary app's folder moves, and installed embedded folders remain unchanged

#### Scenario: Archive and restore
- **WHEN** an embedded app is archived and later unarchived
- **THEN** it moves between Projects and Archive with correct counts, remains runnable/buildable/publishable while archived where normally supported, and returns to its prior surviving section or Unsorted without resetting identity

#### Scenario: Installed archived default
- **WHEN** an embedded project starts archived in the product defaults and the user unarchives it
- **THEN** a durable user override makes it appear in Projects without moving the installed archived source or creating a second catalog entry

#### Scenario: Section lifecycle
- **WHEN** the user renames or removes a mixed-origin section or moves/archives its final project
- **THEN** embedded organization and ordinary folder placement follow the normal section rules, deliberately created empty sections remain allowed, and an occupied section emptied by the operation disappears

#### Scenario: Concurrent organization changes
- **WHEN** another writer changes a project's organization while a stale layout or archive request is being prepared
- **THEN** the stale operation is refused or safely serialized without lost updates, identity collisions or source-folder mutations
