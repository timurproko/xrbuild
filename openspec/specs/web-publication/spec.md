# web-publication Specification

## Purpose
Defines how the core delegates WebXR publication to workspace plugins while preserving stable routes, isolated updates and trustworthy status.

## Requirements

### Requirement: Publisher plugin discovery
The panel SHALL discover enabled workspace packages that declare a publisher module. A publisher SHALL expose a unique stable name, HTTPS origin, route rules, validation, status, Publish and Unpublish operations, and MAY expose a user-facing label.

#### Scenario: Publisher available
- **WHEN** an enabled workspace package exports a valid publisher with a user-facing label
- **THEN** WebXR projects can select that label in the custom dropdown while the manifest stores the stable publisher name

#### Scenario: Publisher invalid
- **WHEN** a declaration is missing, malformed, duplicated or fails to load
- **THEN** the panel reports the problem and continues to support Build, Run and package creation

### Requirement: Stable publication identity
Every configured publication SHALL have a generated stable identity, selected publisher and normalized slug. An empty slug SHALL select the publisher's route-prefix root; every non-empty slug SHALL satisfy the generic and publisher route rules. Project folder, title, platform and package identity changes SHALL NOT silently change its route.

#### Scenario: Project renamed
- **WHEN** a configured project folder or display name changes
- **THEN** its publication identity, publisher and slug remain unchanged

#### Scenario: Publisher root
- **WHEN** a publication uses an empty normalized slug
- **THEN** its canonical route is the publisher's route-prefix root without an extra path segment

#### Scenario: Invalid slug
- **WHEN** a non-empty slug is unnormalized, contains traversal or separators, or violates publisher route rules
- **THEN** configuration is rejected before publication

### Requirement: Verified build input
The core SHALL call a publisher only with a successful web build whose entry tree still matches its persisted build receipt. When the project has a configured browser build script, every Publish request SHALL run that script from current source, finalize the output and verify its fresh receipt before calling the publisher, even when a prior receipt is valid. A project without a build script MAY reuse only current verified static output. The input SHALL contain only files inside the built entry folder.

#### Scenario: Current build
- **WHEN** a project with a build script requests Publish while its prior build receipt and entry tree are still valid
- **THEN** Publish runs the build script again and passes the publisher only the newly finalized and verified output

#### Scenario: Changed output
- **WHEN** built output or relevant settings changed after the last successful build
- **THEN** Publish rebuilds automatically and calls the publisher only if the new output succeeds and remains current

#### Scenario: Static current output
- **WHEN** a project has no build script and its existing entry tree matches a successful receipt
- **THEN** Publish may pass that verified static entry to the publisher without claiming it rebuilt source

#### Scenario: Unsafe entry
- **WHEN** the entry has no index page, contains a link or escapes the project folder
- **THEN** the publisher is not called

### Requirement: Isolated complete-site operations
A publisher SHALL preserve unrelated routes and required root files when publishing, moving or unpublishing one identity. It SHALL serialize conflicting decisions, retry or refuse a non-fast-forward conflict, and SHALL NOT force an older state over a newer one. When Pages uses Actions, the local publisher SHALL be the sole publication-decision writer and the public workflow SHALL be the sole Pages deployment writer.

#### Scenario: Publish second project
- **WHEN** a second local app identity is published
- **THEN** both identities' routes, inventory, associations and required root files remain deployed

#### Scenario: Unpublish one project
- **WHEN** an owner confirms Unpublish for one local app
- **THEN** only its owned route and explicitly retired associations are removed while unrelated site files stay deployed

#### Scenario: Concurrent update
- **WHEN** the public branch advances during a publication
- **THEN** the publisher reloads and reapplies or refuses without overwriting the newer decision

### Requirement: Publisher recovery and status
A publisher SHALL report selected and deployed URLs, pending operation, last success, last safe error and diagnostic link when available. A successful local commit or workflow dispatch SHALL NOT alone count as deployment success: the correlated Pages workflow and public route SHALL verify. A failed operation SHALL preserve or restore the last-known-good complete site before reporting rollback success; an uncertain commit-versus-deployment state SHALL be reported honestly and recoverable without force-pushing.

#### Scenario: Successful publish
- **WHEN** the correlated deployment succeeds and the requested route and complete site verify publicly
- **THEN** status reports the deployed URL and success time

#### Scenario: Deployment failure
- **WHEN** dispatch, deployment or verification fails after an output commit
- **THEN** the publisher attempts a safe route-scoped rollback and baseline redeploy, verifies restoration, or explicitly reports why restoration cannot be verified

#### Scenario: Failed operation
- **WHEN** validation, update, deployment or verification fails
- **THEN** status does not claim the requested state and reports whether the prior site was preserved or restored

#### Scenario: Status unavailable
- **WHEN** the publisher or its remote service cannot be reached
- **THEN** the panel reports unavailable status without deleting local publication configuration

#### Scenario: Interrupted operation
- **WHEN** the panel stops after pushing output but before verifying its deployment
- **THEN** status does not claim success and the maintainer can recover from authoritative public branch and workflow state

### Requirement: Canonical launcher route
When package creation is available for a WebXR app with configured publication, the panel SHALL give the packager the publisher-derived canonical route. The packager SHALL use that route instead of maintaining a second web-folder setting.

#### Scenario: Create a headset launcher
- **WHEN** a developer creates a package for a WebXR app configured at `/apps/<slug>/`
- **THEN** the packager receives that complete canonical URL as its launch URL

### Requirement: Installed-package associations
A publisher MAY manage an origin-root package-association document. Association changes SHALL be explicit and separate from package creation, and SHALL contain package identity and certificate fingerprint but no signing secrets.

#### Scenario: Supported installed package
- **WHEN** a trusted external packager explicitly registers a supported installed package for an active route
- **THEN** the publisher includes its association at the origin root

#### Scenario: Route retirement
- **WHEN** a route with installed-package associations is moved or unpublished
- **THEN** the operation requires confirmation and records which associations remain supported

### Requirement: Dedicated publication repository
A production publisher SHALL target an explicitly configured public publication repository, branch and Pages subtree that are independent from the private core repository. With Actions hosting, a local publisher SHALL write only the selected app's validated generated output and publisher-owned metadata into that public subtree in a non-force, route-scoped commit; it SHALL NOT send the project's source, tests, private core, plugins or credentials. It SHALL verify the expected public repository, branch, Pages workflow hosting, custom HTTPS origin and ownership before any push. The maintainer SHALL NOT be required to maintain a second local checkout; a disposable publisher-managed cache is permitted.

#### Scenario: Public deployment target
- **WHEN** the public repository's expected branch, `docs/` path, workflow hosting and HTTPS origin are verified
- **THEN** a local publisher may push only validated output and owned metadata to that subtree before dispatching redeploy

#### Scenario: Wrong repository, branch or path
- **WHEN** the configured repository, branch, subtree or Pages origin do not match production
- **THEN** the publisher refuses to push or dispatch

#### Scenario: Source files preserved
- **WHEN** an app is published or unpublished
- **THEN** project source and package metadata outside the output subtree remain unchanged

#### Scenario: Actions mode
- **WHEN** Pages uses the trusted redeploy-only workflow and no public-source writer remains
- **THEN** a local publisher may push validated output and request redeploy, but cannot itself deploy Pages

#### Scenario: Publish local output
- **WHEN** a configured local app has a current validated build and the expected Pages workflow hosting is active
- **THEN** the publisher commits only its owned route and metadata to the public site's `docs/` tree and requests deployment through the trusted workflow

#### Scenario: Unsafe target or build
- **WHEN** the hosting target is wrong, the route belongs to another identity or output contains unsafe entries
- **THEN** the publisher refuses to push or dispatch without changing the public site

### Requirement: Publication repository cutover
A publication-repository migration SHALL preserve the complete publisher-owned site state, including publication identities, slugs, inventory, root association data, custom-domain file and route bytes. The old deployment branch SHALL remain available until the new origin serves and verifies that state. After cutover, the old repository SHALL no longer hold a publication branch or custom-domain claim.

#### Scenario: Migrate existing routes
- **WHEN** publication state moves to the new public repository's `main:docs/` subtree
- **THEN** the source and destination site-tree digests match before the old private branch is removed

#### Scenario: Cutover verified
- **WHEN** the custom origin serves the migrated inventory, every recorded route and the association document from the new repository
- **THEN** the publisher target can switch and the old deployment branch can be retired

#### Scenario: Cutover fails
- **WHEN** the custom origin does not verify
- **THEN** the old deployment branch remains available and no route is claimed migrated

### Requirement: Safe transition to Actions hosting
A change to local-build publication under Actions Pages SHALL require a reviewed coordinated handoff. The public workflow SHALL retire public-source publish/unpublish operations before accepting local output as the sole source of site decisions, while preserving a redeploy-only path and the existing `docs/` tree. Neither the transition nor its tests SHALL trigger a production publication without maintainer confirmation.

#### Scenario: Before cutover
- **WHEN** public-source publishing is still enabled or the replacement output path is unverified
- **THEN** local publication refuses to push and the existing site continues to serve untouched

#### Scenario: After verified cutover
- **WHEN** redeploy-only workflow deployment and unchanged site content have been verified
- **THEN** a maintainer can enable local-build publication without switching Pages hosting modes

#### Scenario: Cutover rollback
- **WHEN** replacement deployment fails to verify
- **THEN** the maintainer retains and can redeploy the last-known-good committed `docs/` tree without changing the custom domain

#### Scenario: Source-driven workflow still active
- **WHEN** the public workflow can still update routes from public app source
- **THEN** local publishing refuses to write so that two publication writers cannot race

#### Scenario: Coordinated cutover
- **WHEN** the public workflow only redeploys committed output and the local publisher has validated the repository and site
- **THEN** a maintainer may explicitly publish the selected local app, without changing Pages settings or unrelated routes

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

### Requirement: Publisher configuration state

A publisher MAY report `configured: false` with a bounded configuration problem. Such a publisher SHALL remain
discoverable, SHALL refuse Publish, Unpublish and release operations, and its origin SHALL NOT be presented as a
destination. Publishers that omit the field SHALL be treated as configured. A publisher whose destination requires
explicit user configuration SHALL report itself unconfigured until that configuration is complete and valid.

#### Scenario: Explicit destination missing
- **WHEN** a publisher's destination configuration is absent or incomplete
- **THEN** it reports `configured: false` with the missing requirement and every publication operation is refused

#### Scenario: Destination configured
- **WHEN** the configuration becomes complete and valid and services refresh
- **THEN** the publisher reports itself configured and shows its real origin
