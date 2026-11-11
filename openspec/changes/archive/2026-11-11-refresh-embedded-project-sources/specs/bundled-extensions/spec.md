## MODIFIED Requirements

### Requirement: Embedded projects and writable user projects
The project catalog SHALL distinguish embedded and user project identities, including matching folder names. Embedded projects SHALL support the same capability-based development, settings, rename, icon, run, build, package, publication and organization operations as user projects without requiring an independent copy. Deletion SHALL be the only restriction based solely on embedded project origin, enforced both at HTTP boundaries and direct operation entry points. Normal operations SHALL NOT mutate installed embedded sources or product-default configuration. Mutable manifests, editable working sources, icons, publication/signing state and recordings SHALL use durable contained user-owned state, scoped by canonical installation, selected workspace, selected project repository and qualified logical project identity. Discovery SHALL NOT initialize working sources or install dependencies. Effective manifest saves SHALL compare complete content-bound revisions, including not-yet-imported personal settings, and use cooperating-writer locks with atomic replacement so equal timestamps do not allow stale edits. New independent projects and optional explicit copies SHALL default to the selected writable project repository. Installed input changes SHALL use automatic safe refresh at explicit source-consuming action boundaries rather than require routine acknowledgement of an old working snapshot; genuine conflicts and incompatible state SHALL remain non-destructive action failures.

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
- **THEN** personal settings and deployment identity survive, compatible current sources are adopted automatically on the next explicit source-consuming action, logical identity survives installed default-section relocation, and incompatible source edits are preserved without silently running an acknowledged old snapshot

#### Scenario: Separate project repository
- **WHEN** a project repository is selected independently from the integration workspace
- **THEN** effective embedded project state and organization are isolated for that selection, while ordinary projects and private integration ownership remain unchanged

## ADDED Requirements

### Requirement: Automatic safe refresh of embedded working sources
Explicit source-consuming actions SHALL refresh changed embedded inputs under project locks using validated atomic generations and content baselines. Refresh SHALL preserve personal state and compatible edits, refuse conflicts or unsafe state without data loss, retain legacy generations and active consumers, and invalidate stale output. Discovery SHALL remain read-only; refresh SHALL NOT authorize cleanup.

#### Scenario: Upstream-only source update
- **WHEN** installed sources add, modify or remove files after working inputs were prepared and those files have no conflicting local edits
- **THEN** the next explicit action uses the current installed membership/content with compatible local settings retained and no manual source acknowledgement

#### Scenario: Shared source update
- **WHEN** the installed shared SDK or build inputs change while the selected project's own sources and personal choices do not
- **THEN** preparation uses the current shared inputs without freezing the old snapshot or mistaking saved settings for an app-source conflict

#### Scenario: Compatible actual source edit
- **WHEN** a known-baseline local edit does not conflict with an installed update, or both sides make the same change
- **THEN** the refreshed generation retains the local edit and adopts current compatible installed changes

#### Scenario: Conflicting actual source edit
- **WHEN** the same known-baseline input is incompatibly changed or deleted locally and upstream
- **THEN** the requested action fails with a recovery diagnostic, preserves all local inputs and previous state, and does not publish partial or falsely current output

#### Scenario: Legacy working state
- **WHEN** an older working-state record lacks a recoverable per-file baseline and contains ordinary validated personal choices
- **THEN** preparation automatically stages current installed sources, carries those choices forward, retains the complete old generation with durable recovery metadata, and never claims unknown old sources were unedited or deletes them

#### Scenario: Ambiguous legacy source configuration
- **WHEN** an older record contains source/build configuration that cannot be distinguished safely from local customization
- **THEN** the action refuses the ambiguous transition without discarding that configuration or falsely reporting that the current installed code was selected

#### Scenario: Refresh during active use
- **WHEN** a working generation is leased by a run, development server, job or another writer
- **THEN** the conflicting refresh is serialized or refused without rewriting active inputs, stopping the consumer or removing foreign locks

#### Scenario: Input race or interrupted publication
- **WHEN** installed inputs or effective configuration change while a candidate is staged, or staging/publication fails
- **THEN** the candidate is not made effective, prior data remains preserved and the next action cannot treat incomplete state as successfully refreshed

#### Scenario: Current output after refresh
- **WHEN** sources refresh after an earlier successful build
- **THEN** new consumers require output bound to refreshed inputs rather than automatically falling back to old or packaged output, while existing consumers retain already pinned generations

#### Scenario: Personal and product separation
- **WHEN** a source refresh carries personal choices, identity, icons or recordings across an installed default-section relocation or restart
- **THEN** those values remain in their proper user-owned scope, inherit current compatible source defaults, keep logical organization/identity, and do not rewrite installed product files or ordinary projects
