## ADDED Requirements

### Requirement: Optional versioned release capability
A publisher MAY expose a complete versioned release capability: read-only history/status, version-aware publication and activation of a retained owned release. The core SHALL validate that capability and gate its release APIs/UI on support. Existing publisher modules SHALL retain their legacy behavior without being assigned synthetic version history.

#### Scenario: Supported publisher
- **WHEN** an enabled publisher declares the complete release capability
- **THEN** the panel can query its release catalog, publish a new version and activate a retained release through generic interfaces

#### Scenario: Previewable archives
- **WHEN** a publisher serves its retained output publicly
- **THEN** each catalog entry MAY carry an HTTPS preview URL for that exact retained output, and the panel offers it for inspection without deploying anything

#### Scenario: Legacy or incomplete capability
- **WHEN** a publisher has no release capability or declares an incomplete capability
- **THEN** a legacy publisher keeps its existing operations without version controls, while an incomplete declaration is reported rather than silently accepting unsupported release operations

### Requirement: Immutable publication releases
Versioned publication SHALL associate retained output with its publisher, stable publication identity, immutable release ID, stable three-part semantic version and content digest. New semantic versions SHALL exceed the highest retained semantic version for that destination. A version SHALL NOT be overwritten with different bytes. A matching artifact MAY be reused for a safe retry. Only validated generated output and publisher-owned metadata SHALL enter release storage.

#### Scenario: Publish an update
- **WHEN** a developer publishes a valid next version of an existing app
- **THEN** the publisher stages the verified output and deploys it at the same canonical route without first unpublishing, retaining previous releases and preserving unrelated site state

#### Scenario: Existing version reused
- **WHEN** an existing version is submitted with different output
- **THEN** the publisher refuses the overwrite without changing the live route or retained release

#### Scenario: Version after rollback
- **WHEN** an older release is live while a higher semantic version is retained
- **THEN** a new release must advance beyond the highest retained version, not just the live version

#### Scenario: Unsafe retained artifact
- **WHEN** creation or activation encounters a path escape, link, corrupt digest, private file, size-limit violation or unowned storage namespace
- **THEN** it fails before changing the active publication

### Requirement: Authoritative history and verified activation
Release catalogs SHALL survive panel restart and local cache loss using publisher-authoritative storage. They SHALL distinguish retained releases, requested deployment and verified live release. Activation SHALL require a retained release owned by the selected identity and publisher, explicit confirmation and a current decision precondition. Activation SHALL deploy exact retained bytes at the canonical route without rebuilding current source or changing package identity/version.

#### Scenario: Restore a historical version
- **WHEN** a developer confirms Make live for an owned retained release
- **THEN** its exact artifact is deployed and reported Live only after the public route verifies, with the same publication identity and canonical URL

#### Scenario: Reload after deployment
- **WHEN** the panel or publisher cache is restarted
- **THEN** the catalog and verified live release are recovered from authoritative publisher state rather than local optimistic intent

#### Scenario: Foreign release or stale decision
- **WHEN** a request names another identity's release or its expected decision revision is no longer current
- **THEN** the operation refuses without overwriting another deployment or silently choosing another release

#### Scenario: Already live release
- **WHEN** the selected retained release is already verified live
- **THEN** activation performs no rebuild or deployment

#### Scenario: Legacy API bypass
- **WHEN** an unversioned request would replace output for an identity with versioned history
- **THEN** the provider requires the release-aware validation path or refuses without bypassing history

### Requirement: Safe release migration and retention
Queries SHALL NOT migrate or write deployments. Unversioned output SHALL be labeled Legacy, not assigned an invented version. The first explicit versioned update SHALL preserve verified legacy output as a selectable release. Unpublish SHALL remove the active route under existing ownership/association rules while retaining releases/history; public archives SHALL NOT be represented as private or erased.

#### Scenario: First update of a legacy deployment
- **WHEN** an owned unversioned deployment receives its first explicit versioned update
- **THEN** the previous verified bytes are retained as Legacy before replacement, preserving its identity and unrelated site state

#### Scenario: Unpublish and restore
- **WHEN** an app is unpublished and a retained release is later explicitly activated
- **THEN** history survives and activation can restore that release without rebuilding the app

#### Scenario: Invalid catalog
- **WHEN** a stored catalog is corrupt, unsupported or cannot establish ownership
- **THEN** the publisher fails safely instead of replacing or resetting history

#### Scenario: Active inventory compatibility
- **WHEN** versioned releases are retained or activated
- **THEN** the existing active inventory remains compatible with Launcher and contains only active app entries, not archived releases

### Requirement: Release decision recovery
Updates, activation and Unpublish SHALL share serialized, non-force, ownership-scoped deployment decisions. The provider SHALL preserve unrelated routes, root-publication files, association data and retained releases. A candidate commit or dispatch SHALL NOT establish live success. Failed verification SHALL attempt safe restoration of the previous complete-site decision, verify restoration or honestly report the unresolved state. Concurrent changes SHALL NOT be forcefully reverted.

#### Scenario: Build or staging failure
- **WHEN** a new release cannot be built or safely staged
- **THEN** the previous deployment remains untouched

#### Scenario: Failed update or activation
- **WHEN** deployment or public verification fails
- **THEN** the requested release is not marked Live and the provider verifies restoration of the previous decision or reports why restoration is uncertain

#### Scenario: Interrupted or concurrent operation
- **WHEN** work is interrupted or another writer advances the decision
- **THEN** subsequent status distinguishes requested, verified and unknown state and no force-push or unsafe rollback overwrites the newer decision

### Requirement: Publication card
A publisher SHALL accept an optional publication card with each publish and activation: the app's name, its description and how its icon renders (default or custom, colour, shape, whether the app provides a 3D model). The publisher SHALL store the card with the active deployment record and serve it with its inventory, so a launcher presents a published app exactly like its local preview without rebuilding the app. The card follows the latest publish or activation, not the retained bytes. A malformed card SHALL never be stored.

#### Scenario: Launcher renders the published card
- **WHEN** a launcher loads a publisher inventory whose entry carries a card
- **THEN** it uses the card's name, description and icon settings instead of metadata read from the published page

#### Scenario: Card changes without a rebuild
- **WHEN** a project's name, description or icon settings change and the app is published or activated again with unchanged bytes
- **THEN** the inventory carries the new card and the launcher shows it

#### Scenario: Pages without a card
- **WHEN** an inventory entry carries no card or a malformed one
- **THEN** the launcher ignores it and falls back to the published page's metadata

### Requirement: Release deletion
A publisher with the release capability SHALL provide deletion of one owned retained release: it SHALL require the release to be retained by the selected identity, neither deployed at the canonical route nor the requested deployment, and a current decision precondition; it SHALL remove the retained output and the catalog entry so the public archive stops serving, SHALL leave the live route, unrelated releases, routes and association files unchanged, and SHALL move the catalog revision. The panel SHALL validate the same conditions and require confirmation before queueing the deletion.

#### Scenario: Delete an old release
- **WHEN** a developer confirms Delete for a retained release that is not live
- **THEN** the release disappears from history and its archive no longer serves, while the live release, its URL and the next-version suggestion are unchanged

#### Scenario: Live or requested release
- **WHEN** a deletion names the deployed release or the requested deployment
- **THEN** the publisher and the panel refuse it and advise activating another version or unpublishing first

#### Scenario: Stale or foreign deletion
- **WHEN** a deletion carries an outdated decision revision or names a release another identity owns
- **THEN** the operation refuses without changing any history
