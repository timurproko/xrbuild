## ADDED Requirements

### Requirement: Panel dispatch of authoritative publication workflow
When workflow-based hosting is active, the production publisher MAY expose approved public project identities and an authenticated panel dispatch interface. The panel SHALL use the same trusted public workflow as the Actions UI, not a second local site writer; the workflow SHALL continue to enforce its default branch, approved identities, complete-site deployment, verification and rollback. A non-secret dispatch correlation identifier MAY be supplied, but SHALL NOT select a ref, path or build script.

#### Scenario: Approved panel dispatch
- **WHEN** a maintainer requests Publish for an approved public project in the local panel
- **THEN** the server dispatches the trusted workflow against committed public source, and does not push local site or app files

#### Scenario: Identity mismatch
- **WHEN** the requested project is not allowlisted or its committed identity or route disagrees with the public inventory
- **THEN** the request is refused before workflow dispatch

#### Scenario: Failure and restoration
- **WHEN** the correlated workflow fails to deploy or verify and attempts restoration
- **THEN** the panel shows the workflow failure and restoration status without reporting the requested publication as live

#### Scenario: Manual fallback
- **WHEN** panel dispatch is unavailable or the local login expires
- **THEN** the original Actions UI remains available without changing the hosting source
