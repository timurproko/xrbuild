## MODIFIED Requirements

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

#### Scenario: Optional independent copy
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

#### Scenario: Existing personal choices before preparation
- **WHEN** the user opens or runs an unmaterialized embedded project with valid saved personal choices
- **THEN** its normal controls and launch snapshot reflect those choices without rewriting product defaults or initializing editable sources during discovery

#### Scenario: One-time import and subsequent edits
- **WHEN** an explicit writable action first prepares an embedded project and the user later changes normal project settings
- **THEN** validated legacy choices initialize the effective settings once, subsequent edits remain authoritative across reloads, and the legacy record is preserved rather than reapplied over those edits

#### Scenario: Legacy malformed or stale settings
- **WHEN** an unmaterialized project's legacy settings are malformed, oversized, linked, foreign, stale or have an incompatible selected provider schema
- **THEN** their consumption or conflicting save is refused with a user-state recovery location, without silently replacing the file or weakening its old validation

#### Scenario: Scope survives user organization
- **WHEN** the user moves or archives an embedded project before materialization
- **THEN** its existing source-bound legacy settings and cached output remain addressable while the stable logical identity and new effective state are independent of user section/archive placement

### Requirement: Explicit cached bundled project rebuilds
The panel SHALL expose supported embedded project development and build scripts through normal project actions without modifying installed sources or implicitly installing user/private workspace packages. An explicit source-consuming action SHALL prepare or reuse contained durable user-owned working inputs using the pinned manager and validated frozen public dependency graph, and SHALL build declared transitive local prerequisites in order. Unsupported dependency configuration SHALL produce an actionable preparation failure rather than silently installing an ambient workspace or making an independent project copy a workflow prerequisite. Installation lifecycle hooks SHALL remain disabled for managed public snapshot preparation. Successful finalized builds SHALL publish checked immutable output generations with atomic receipts bound to installation, effective source/settings and output content. Development, runs, icon jobs, packaging and publication SHALL consume coherently resolved effective project snapshots. Durable working sources and configuration SHALL NOT be treated as disposable build cache. These checks SHALL NOT be described as a sandbox or export audit.

#### Scenario: Build from normal workflow
- **WHEN** the user builds an embedded app through the normal Develop or Build workflow
- **THEN** the panel starts an observable job using checked user-owned inputs, and successful output is available to native/browser runs, packaging and publication without rewriting installed files

#### Scenario: Development and source changes
- **WHEN** the user requests a declared development script or edits effective working sources
- **THEN** the normal development workflow uses the durable working tree, and restart/rebuild does not discard local edits

#### Scenario: Unsupported installation contract
- **WHEN** effective public inputs have unsupported package-manager configuration, invalid graph/lock links or escaping filesystem dependencies
- **THEN** preparation fails with the location and corrective requirement without installing surrounding user/private packages or modifying product sources

#### Scenario: Failed, stale or foreign local state
- **WHEN** effective settings, source-baseline state or build receipts/output are invalid, incomplete, failed, stale, malformed, linked or bound to another project
- **THEN** the affected new action is blocked with a recovery diagnostic rather than automatically selecting packaged or older output, and original user data is preserved

#### Scenario: Existing consumers during another build
- **WHEN** a new build succeeds or fails after a browser/native consumer selected a successful generation
- **THEN** the existing consumer retains its validated reserved output and its generation-qualified assets remain available under the existing containment rules

#### Scenario: Overlapping actions or settings writers
- **WHEN** incompatible project preparation, launches, builds, organization or settings changes overlap
- **THEN** the panel serializes or refuses conflicting actions, checks revisions before publication, and does not remove foreign locks or partially overwrite state

#### Scenario: Cache cleanup
- **WHEN** the user reviews and removes obsolete working build generations
- **THEN** durable effective sources, manifests, personal choices, publication/signing data, reserved generations and installed defaults remain intact

## ADDED Requirements

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
