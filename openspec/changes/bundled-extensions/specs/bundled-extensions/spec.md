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
The project catalog SHALL distinguish embedded and user project identities, including matching folder names. Normal panel operations SHALL NOT mutate tracked embedded project sources or product-default configuration. Editable copies SHALL be created explicitly in the selected project repository. New projects SHALL default to that writable root. User overrides, layout, publication/signing state and recordings SHALL remain outside embedded sources.

#### Scenario: Same project name
- **WHEN** an embedded project and user project share a folder name
- **THEN** both remain separately addressable and editing or archiving the user project cannot affect the embedded project

#### Scenario: Legacy editable project reference
- **WHEN** a request uses an unqualified project ID
- **THEN** it addresses only the selected editable project repository, even when a bundled project has the same ID, while qualified keys address their own origin and preserve archive membership

#### Scenario: Packaged preview without source writes
- **WHEN** a bundled project has packaged output and is previewed or run in built mode
- **THEN** the panel reads contained output without installing dependencies, running scripts, finalizing favicons or writing product build receipts, and launch configuration/default icons/recordings use user-owned state

#### Scenario: Writable alias into product source
- **WHEN** a project mutation reaches a product file through a linked writable root, asset, layout file or build-state path
- **THEN** it is rejected before modifying that product file, regardless of the requested project's displayed origin

#### Scenario: Customize a bundled project
- **WHEN** a user requests an editable copy of an embedded project
- **THEN** the panel creates an independent project in the writable project root without inheriting deployment credentials or a live publication identity

#### Scenario: Read-only product installation
- **WHEN** the embedded workspace is read-only
- **THEN** catalog/preview/run operations use packaged artifacts and writable user state, and any requested rebuild uses a writable output root without rewriting product source

#### Scenario: Separate project repository
- **WHEN** an explicit project repository is selected independently from the user integration workspace
- **THEN** new and copied projects belong to that project repository while embedded source and private integration ownership remain unchanged

### Requirement: Personal bundled run settings
The panel SHALL provide personal input/display/monitor/fullscreen/projection/camera choices for bundled projects without modifying product manifests. Persistent overrides SHALL use canonical core/project-scoped user configuration outside disposable build caches and independently selected editable project repositories. Missing values SHALL inherit product defaults without discovery-time writes. Only the declared run-setting fields and actual selected native providers' declared boolean/number/select fields SHALL be accepted. Advanced values SHALL bind selected binary ownership, origin and schema; scripts, paths, secret/text/recording-like fields, arbitrary plugin configuration, targets and deployment/signing identity SHALL NOT be accepted as personal run overrides. Explicit save/reset SHALL require a revision bound to source defaults and saved bytes and use exclusive cooperating-writer locking and atomic replacement. Invalid, oversized, linked or foreign state SHALL block Run without overwriting or echoing its contents.

#### Scenario: Save and restore personal choices
- **WHEN** a user saves personal run choices and later restores bundled defaults
- **THEN** the UI and native/browser launches use the saved choices until reset, product sources remain unchanged, and explicit per-run options affect only that launch

#### Scenario: Defaults or another writer changed
- **WHEN** another writer saves the same project settings or product defaults change after an editor loaded them
- **THEN** the stale revision is rejected rather than overwriting the newer state, and concurrent cooperating processes cannot lose an update

#### Scenario: Invalid personal state
- **WHEN** saved settings are malformed, oversized, linked, unsupported or bound to another installation/project
- **THEN** the panel reports the user configuration location for review and refuses Run/save/reset without silently falling back or replacing the original bytes

#### Scenario: Schema-bound advanced provider choices
- **WHEN** a user saves declared advanced fields and later deselects or changes that provider's source/schema
- **THEN** valid choices apply only while selected, inactive saved choices remain intact, and mismatched ownership/schema blocks use without reinterpreting or rewriting saved bytes

#### Scenario: Settings during active use
- **WHEN** a settings update overlaps that project's active work or a launch is being prepared
- **THEN** the panel refuses the update, and a launch consumes one complete settings snapshot

### Requirement: Explicit cached bundled project rebuilds
The panel SHALL offer explicit rebuilds for supported bundled project package scripts without modifying product sources or installing user/private workspace packages. Rebuilds SHALL copy public embedded inputs into fresh user-owned working generations, require a pinned pnpm manager and frozen canonical workspace lockfile, disable installation lifecycle hooks, and build declared transitive local prerequisites before the project's declared build script. Unsupported package-manager configuration, nested workspaces, external file/link dependencies and non-dedicated output entries SHALL require an editable copy. Inherited package-manager and Git configuration SHALL NOT select another workspace or surrounding repository implicitly. Successful output SHALL be copied into an exclusive immutable runtime generation, with atomic core/source-qualified receipts binding input and output content/membership. These controls SHALL NOT be represented as an execution sandbox or export audit.

#### Scenario: Rebuild through the bundled detail view
- **WHEN** the user explicitly requests a supported bundled project rebuild
- **THEN** the UI starts an observable job, installation/build/finalization writes stay in the selected user cache, and successful browser/native launches resolve the same validated output while product files remain unchanged

#### Scenario: Unsupported installation contract
- **WHEN** the embedded package workspace lacks its pinned manager/frozen lockfile/canonical package globs or declares unsupported configuration or filesystem dependencies
- **THEN** the rebuild is rejected rather than installing a surrounding user/private workspace or changing the installed source to repair it

#### Scenario: Failed, stale or foreign local project state
- **WHEN** local build state exists but its receipt/output is missing, incomplete, failed, stale, malformed, oversized, linked, changed or bound to another source
- **THEN** new Run and unqualified preview are blocked without packaged fallback, the recovery location is reported, and saved personal settings and retained working/runtime generations are not removed or reset

#### Scenario: Existing cached consumers during another build
- **WHEN** another build publishes new output or fails after a browser/native consumer selected a successful generation
- **THEN** its immutable files remain intact, generation-qualified browser assets remain explicitly readable after validation, and old generations are never silently selected as automatic fallback

#### Scenario: Overlapping project builders and launches
- **WHEN** a project rebuild overlaps another writer, an active project run/job or launch/settings preparation
- **THEN** the panel rejects conflicting work, independent builders serialize through an exclusive per-project lock, and a foreign or leftover lock is not removed automatically

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
Embedded plugins SHALL declare validated safe default configuration and store mutable user configuration only under the selected user workspace's `config/plugins/<plugin-id>/`. Missing configuration SHALL be created without replacing existing files, including concurrent first runs. Invalid existing configuration SHALL report a diagnostic, not be overwritten. Newly added missing fields MAY use validated in-memory defaults without rewriting existing user data. Link/path escapes SHALL be refused. Discovery SHALL NOT create credentials, signing keys or live production destinations.

#### Scenario: First and repeated startup
- **WHEN** a plugin's user configuration is absent and then the plugin is loaded again after the user edits it
- **THEN** the first load creates defaults and later loads preserve the user's file and values

#### Scenario: Invalid existing configuration
- **WHEN** the existing user config is malformed or points through an unsafe link
- **THEN** loading reports an actionable error without overwriting the config or falling back to a live deployment

#### Scenario: Concurrent first runs
- **WHEN** two processes attempt to create the same missing configuration
- **THEN** a complete valid configuration is visible and neither process replaces a file created or edited by the other

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
