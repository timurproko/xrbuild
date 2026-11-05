# web-publication Specification

## Purpose

Defines how the core delegates WebXR publication to workspace plugins while preserving stable routes, isolated updates and trustworthy status.

## ADDED Requirements

### Requirement: Publisher plugin discovery
The panel SHALL discover enabled workspace packages that declare a publisher module. A publisher SHALL expose a unique name, HTTPS origin, route rules, validation, status, Publish and Unpublish operations.

#### Scenario: Publisher available
- **WHEN** an enabled workspace package exports a valid publisher
- **THEN** WebXR projects can select it for publication

#### Scenario: Publisher invalid
- **WHEN** a declaration is missing, malformed, duplicated or fails to load
- **THEN** the panel reports the problem and continues to support Build, Run and package creation

### Requirement: Stable publication identity
Every configured publication SHALL have a generated stable identity, selected publisher and normalized slug. Project folder, title, platform and package identity changes SHALL NOT silently change its route.

#### Scenario: Project renamed
- **WHEN** a configured project folder or display name changes
- **THEN** its publication identity, publisher and slug remain unchanged

#### Scenario: Invalid slug
- **WHEN** a slug is empty, unnormalized, contains traversal or separators, or violates publisher route rules
- **THEN** configuration is rejected before publication

### Requirement: Verified build input
The core SHALL call a publisher only with a successful web build whose entry tree still matches its persisted build receipt. The input SHALL contain only files inside the built entry folder.

#### Scenario: Current build
- **WHEN** the build receipt and current entry tree have the same digest and project settings
- **THEN** Publish passes that entry folder and neutral publication identity to the publisher

#### Scenario: Changed output
- **WHEN** built output or relevant settings changed after Build
- **THEN** Publish is refused with an instruction to run Build again

#### Scenario: Unsafe entry
- **WHEN** the entry has no index page, contains a link or escapes the project folder
- **THEN** the publisher is not called

### Requirement: Isolated complete-site operations
A publisher SHALL preserve unrelated routes and required root files when publishing, moving or unpublishing one identity. It SHALL serialize conflicting decisions and SHALL NOT force an older state over a newer one.

#### Scenario: Publish second project
- **WHEN** a second identity is published
- **THEN** both identities' routes and required root files remain deployed

#### Scenario: Unpublish one project
- **WHEN** one of several identities is unpublished
- **THEN** only its route and explicitly retired associations are removed

#### Scenario: Concurrent update
- **WHEN** the publisher detects that authoritative state changed during an operation
- **THEN** it reloads and reapplies or refuses the operation without overwriting the newer decision

### Requirement: Publisher recovery and status
A publisher SHALL report selected and deployed URLs, pending operation, last success, last safe error and diagnostic link when available. A failed operation SHALL preserve or restore the last-known-good complete site before reporting rollback success.

#### Scenario: Successful publish
- **WHEN** the requested route is deployed and verified
- **THEN** status reports the deployed URL and success time

#### Scenario: Failed operation
- **WHEN** validation, update, deployment or verification fails
- **THEN** status does not claim the requested state and reports whether the previous site was preserved or restored

#### Scenario: Status unavailable
- **WHEN** the publisher or its remote service cannot be reached
- **THEN** the panel reports status as unavailable without deleting local publication configuration

### Requirement: Installed-package associations
A publisher MAY manage an origin-root package-association document. Association changes SHALL be explicit and separate from package creation, and SHALL contain package identity and certificate fingerprint but no signing secrets.

#### Scenario: Supported installed package
- **WHEN** a trusted external packager explicitly registers a supported installed package for an active route
- **THEN** the publisher includes its association at the origin root

#### Scenario: Route retirement
- **WHEN** a route with installed-package associations is moved or unpublished
- **THEN** the operation requires confirmation and records which associations remain supported
