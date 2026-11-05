## REMOVED Requirements

### Requirement: No-checkout Actions publication
**Reason**: Building committed public app source is not publishing the maintainer's selected local app.
**Migration**: Keep only a trusted deployment workflow for the complete committed public site; build the selected app locally first.

### Requirement: Panel dispatch of authoritative publication workflow
**Reason**: Dispatching a public-source workflow bypasses local build input and moves the source of truth away from local projects.
**Migration**: The panel dispatches a redeploy-only workflow after the local publisher commits only validated output.

## MODIFIED Requirements

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
