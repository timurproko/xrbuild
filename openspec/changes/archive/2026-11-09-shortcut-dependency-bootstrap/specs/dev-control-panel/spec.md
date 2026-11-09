## ADDED Requirements

### Requirement: Pre-import core dependency bootstrap

The existing user, development and auto shortcut entry points SHALL reach a dependency-free bootstrap before the panel's external module imports. It SHALL preserve the selected core, workspace, project repository, port and launcher mode. If no matching responsive panel can be reused and required public core dependencies are missing or unusable, it SHALL automatically repair only that selected core's public package graph with its pinned package manager, a frozen lockfile and lifecycle scripts disabled, showing progress before repair work starts. It SHALL verify installed readiness and unchanged manifest/workspace/lock inputs before launching the panel. It SHALL NOT install private/user project graphs, rewrite tracked dependency declarations/locks, enable lifecycle hooks, install global/native/model tooling or treat an old stamp as proof of readiness. Existing workspace/managed-tool setup policies SHALL remain separate and unchanged.

#### Scenario: Missing dependency after a pull

- **WHEN** a shortcut starts a core checkout whose required runtime dependency is not installed and no correct running panel is reused
- **THEN** the bootstrap opens setup progress, installs that core's locked public dependencies and starts the requested panel only after readiness verification succeeds

#### Scenario: Dependency fails before the panel logger exists

- **WHEN** the main panel would fail during static imports because a required package is missing
- **THEN** bootstrap diagnostics remain available without importing that panel module, and the failure does not disappear with the hidden launch process

#### Scenario: Already ready

- **WHEN** the selected core's required dependencies are usable and no setup is required
- **THEN** the launcher starts or opens the correct panel without invoking package installation or flashing a setup modal

#### Scenario: Existing matching panel

- **WHEN** a responsive panel matches the requested application, core, workspace and project repository on the selected port
- **THEN** the shortcut may open it without starting a second server or changing dependencies underneath it, and it does not force a restart

#### Scenario: Stale readiness stamp or broken dependency link

- **WHEN** prior setup metadata exists but actual dependency resolution/version compatibility fails
- **THEN** the bootstrap does not accept the stamp as success and enters visible repair or an actionable blocked state

#### Scenario: Frozen installation cannot proceed

- **WHEN** dependency installation fails because the lock does not match, network is unavailable or the installation directory is not writable
- **THEN** the bootstrap retains a visible reason and output, leaves tracked input files unchanged, launches no panel for that failed attempt and offers an explicit retry without non-frozen or script-enabled fallback

#### Scenario: Required runtime or manager is unavailable

- **WHEN** the launcher lacks a supported runtime or cannot use the repository-pinned package manager through available tooling
- **THEN** it gives precise prerequisite instructions and a diagnostic location through the startup UI or a native fallback without silently downloading global toolchains or substituting an unpinned manager

#### Scenario: User workspace owns separate packages

- **WHEN** the selected user/development workspace contains its own packages, private data or embedded service state
- **THEN** core bootstrap does not discover/install that graph, activate services or modify those sources/settings, and existing later workspace setup policy remains responsible for them

### Requirement: Visible shortcut setup and verified handoff

A shortcut repair SHALL present a build-free startup page with a modal following the panel's rebuild progress styling, system theme and accessible status conventions. It SHALL show checking, installing and starting states with bounded plain-text live output rather than fabricated percentages or a hidden terminal. Installer and early server errors SHALL remain readable with an explicit reason, owned sanitized diagnostic log and user-initiated Retry, Copy log and Close actions. Success SHALL navigate the setup page into the verified selected panel in the same tab only after readiness and panel identity are confirmed. Refresh/reconnect SHALL NOT restart work, and setup UI teardown SHALL NOT terminate the accepted panel.

#### Scenario: Progress before installation

- **WHEN** missing dependencies require a potentially long install
- **THEN** a visible setup modal explains the operation and streams sanitized output before the repair proceeds, with no browser alert/confirm/prompt or terminal window

#### Scenario: Install succeeds but the server fails

- **WHEN** package installation succeeds but the panel exits, cannot import or reports a startup collision
- **THEN** setup remains failed with server diagnostics and does not announce a ready application or redirect to an unrelated listener

#### Scenario: User retries a failed setup

- **WHEN** the user chooses Retry after a failure
- **THEN** the bootstrap rechecks readiness, input snapshot and setup ownership before beginning one new bounded attempt and preserves diagnostics without an automatic retry loop

#### Scenario: Successful startup

- **WHEN** setup has succeeded and the requested panel answers with the expected core/workspace/projects identity
- **THEN** the current setup tab navigates into that panel without a second application tab, and the server continues running after bootstrap teardown

#### Scenario: Close or reload during setup

- **WHEN** the user tries to dismiss active progress or closes/reloads the browser tab
- **THEN** the UI explains active work where it can, its owner does not orphan or force-kill the installer, and reopening the same shortcut reattaches without starting another install

#### Scenario: Browser cannot show progress

- **WHEN** startup cannot open its progress page
- **THEN** an actionable native fallback gives the failure/log location rather than leaving an invisible long-running repair

#### Scenario: Output contains markup or credentials

- **WHEN** captured output contains markup, terminal codes or sensitive authentication values
- **THEN** the UI renders sanitized bounded text without executing markup or exposing those credential values in display, copied output or persisted logs

### Requirement: Isolated concurrent bootstrap sessions

Core setup SHALL have one verifiable installation owner per canonical checkout and retain each caller's requested launch selection. Duplicate requests for the same target SHALL attach to the current progress instead of spawning competing installers. Different targets SHALL serialize/share core installation without being redirected to each other's workspace. The temporary server SHALL bind only to loopback, allowlist its routes/assets and validate Host, mutation Origin and a per-session capability. It SHALL NOT provide arbitrary filesystem/shell access, delete unverified stale locks, terminate unrelated processes or certify dependency inputs that changed during the attempt.

#### Scenario: Shortcut clicked twice

- **WHEN** the user invokes the same shortcut repeatedly while setup runs
- **THEN** the requests share the same owned progress and one installer, followed by no duplicate panel for the selected target

#### Scenario: User and development shortcuts overlap

- **WHEN** ordinary and development shortcuts request setup for the same core concurrently
- **THEN** core dependency writes are serialized and each caller retains its correct workspace/projects/port destination

#### Scenario: Checkout changes while setup runs

- **WHEN** core manifests, workspace declaration or lock bytes change during installation
- **THEN** the bootstrap rejects readiness for that stale snapshot and asks for an explicit retry rather than launching against unverified inputs

#### Scenario: Unknown coordination owner

- **WHEN** the installation rendezvous or lock is owned by an unverified process or ambiguous record
- **THEN** bootstrap reports the blocked state without deleting the record, killing the process or beginning another installer

#### Scenario: Foreign bootstrap request

- **WHEN** a request has a foreign Host/Origin, lacks the session capability or asks for an unallowlisted route/action
- **THEN** bootstrap refuses it without starting work, running commands or exposing arbitrary core/workspace files
