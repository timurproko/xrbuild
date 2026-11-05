# dev-control-panel Specification Delta

## ADDED Requirements

### Requirement: WebXR publication settings
The Build card SHALL offer publication opt-in, publisher selection and slug only for app projects whose target is `webxr`. These settings SHALL save independently from Platform, package identity and native settings and SHALL show the selected publisher's resulting URL.

#### Scenario: Opt in to publication
- **WHEN** a developer selects an available publisher and valid slug for a WebXR project
- **THEN** the panel saves a stable publication identity without changing platform or package identity

#### Scenario: Native project
- **WHEN** a developer opens an app whose target is `host`
- **THEN** the Build card shows no publication settings or Publish action

#### Scenario: Publisher unavailable
- **WHEN** a manifest names a disabled or missing publisher
- **THEN** the stored selection remains readable but Publish is unavailable

### Requirement: Publish the current web build
Publish SHALL be separate from Build and SHALL require a recorded successful unchanged web build. Run SHALL continue to open the local browser preview, and package creation SHALL remain independent from publication.

#### Scenario: Successful current build
- **WHEN** a WebXR project has a successful current build and the developer clicks Publish
- **THEN** the panel starts a publication job through its selected publisher

#### Scenario: Build missing or changed
- **WHEN** no successful build is recorded or the build output changed after success
- **THEN** Publish is disabled or refused with an instruction to run Build again

#### Scenario: Build does not publish
- **WHEN** Build succeeds
- **THEN** the build receipt updates but no publisher operation starts

#### Scenario: Browser preview stays local
- **WHEN** Run is clicked for a published WebXR project
- **THEN** the panel opens the local preview and does not change the deployed site

### Requirement: Publication status in the Build card
The panel SHALL show selected and deployed URLs, last successful publication time, pending operation, last safe error and diagnostic link when available. Reloading the panel SHALL query the publisher rather than treating local intent as deployment success.

#### Scenario: Publication pending
- **WHEN** a publisher reports an operation still running
- **THEN** the Build card shows the pending operation and diagnostic link

#### Scenario: Publication failed
- **WHEN** a publisher reports failure
- **THEN** the Build card shows the error and does not present the requested route as successfully deployed

#### Scenario: Panel restarted
- **WHEN** the panel restarts after a publication request
- **THEN** it reloads status from the selected publisher

### Requirement: Confirm destructive publication changes
Unpublish and changing a live publisher or slug SHALL use the panel's own confirmation dialog. A route move SHALL NOT promise that the old route remains reachable.

#### Scenario: Unpublish confirmed
- **WHEN** a developer confirms Unpublish
- **THEN** the panel requests removal of only that identity and retains its local build and settings for republish

#### Scenario: Live route changed
- **WHEN** a developer changes the publisher or slug of a deployed identity
- **THEN** the panel explains the route and installed-package impact and submits the move only after confirmation

#### Scenario: Confirmation cancelled
- **WHEN** the confirmation is cancelled
- **THEN** no publisher request or manifest change is made

### Requirement: Publication API validation
The HTTP API SHALL enforce target, manifest freshness, publisher availability, route validation, ownership, build receipt and confirmation rules. UI validation alone SHALL NOT authorize publication.

#### Scenario: Malicious route
- **WHEN** a client submits traversal, separators, an external URL or another invalid slug
- **THEN** the API rejects it without calling the publisher

#### Scenario: Route owned by another identity
- **WHEN** the selected publisher reports that the normalized route belongs to another identity
- **THEN** the API reports the collision and preserves both projects' state

#### Scenario: Wrong target
- **WHEN** a publication endpoint is called for a native or test project
- **THEN** the API rejects the request

### Requirement: Responsive publication controls
Publication fields, actions and status SHALL remain readable and operable at desktop and narrow layouts without hiding Build or package controls.

#### Scenario: Narrow panel
- **WHEN** the Build card is shown at the narrow breakpoint
- **THEN** publication fields and actions stack without horizontal clipping and status links remain reachable
