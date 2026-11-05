## ADDED Requirements

### Requirement: Panel remote publication
The local panel SHALL display approved public apps from the trusted public repository independently of the selected local project workspace, with their source and deployment distinguished from local Build and Run. Publish and Unpublish on these remote entries SHALL invoke only the trusted public workflow; the panel SHALL NOT build or upload local app files as part of that operation.

#### Scenario: No public checkout
- **WHEN** the public app checkout is absent but approved public manifests and publication status are accessible
- **THEN** the panel shows the remote apps with their workflow-backed Publish or Unpublish actions, without offering local Build or Run for them

#### Scenario: Stale local app
- **WHEN** a local project has the same title as an approved public app but its committed remote identity is not verified
- **THEN** its local Publish action cannot dispatch the workflow or silently substitute local bytes for the public source

#### Scenario: Unapproved project
- **WHEN** a local launcher, an unknown public project or conflicting remote metadata is selected
- **THEN** the panel does not offer a production workflow dispatch for it and explains why

### Requirement: Authenticated workflow publication job
A panel workflow publication action SHALL validate a fixed public project identity and operation on the server, dispatch with a locally authenticated user identity, and report the correlated workflow's outcome and diagnostic link. Dispatch acknowledgement SHALL NOT count as deployment success. The panel SHALL keep workflow credentials out of browser responses, tracked files and job logs.

#### Scenario: Verified publish
- **WHEN** a maintainer clicks Publish and the matching workflow run finishes successfully with the requested route verified
- **THEN** the panel reports success and refreshes the publicly deployed route and inventory

#### Scenario: Workflow pending or failed
- **WHEN** the dispatch is accepted but the matching run is still pending, cancelled, fails or cannot be correlated
- **THEN** the panel shows the truthful state and a safe error or run link without claiming a new deployment

#### Scenario: No authentication
- **WHEN** the local machine has no authorized service login
- **THEN** the panel explains the login requirement and makes no publication request

#### Scenario: Confirm removal
- **WHEN** the maintainer requests Unpublish
- **THEN** the panel requires its own confirmation and supplies the workflow's explicit removal confirmation before dispatch

#### Scenario: Restart after dispatch
- **WHEN** the local panel restarts during a publication
- **THEN** it reloads remote inventory and workflow state without treating an old local job as proof of publication
