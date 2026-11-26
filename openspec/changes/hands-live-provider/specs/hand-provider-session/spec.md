# Spec Delta

## Purpose

Provides safe, explicitly owned live hand acquisition outside an app, with the same published skeleton semantics and exclusive camera ownership as managed native applications.

## ADDED Requirements

### Requirement: Explicit headless acquisition

A Hands session SHALL start only on an authenticated explicit request for the globally resolved native source and checked settings. It SHALL use the existing input-provider ABI without opening a display or browser host, changing provider code, or substituting another source. The launch snapshot SHALL remain fixed until Stop and a new Start.

#### Scenario: Start selected native provider
- **WHEN** the person starts an available saved provider with current source and profile revisions
- **THEN** only that provider is created and started, with its checked effective settings and writable workspace data paths
- **AND** no display, platform session or browser host is opened

#### Scenario: Draft or unavailable source
- **WHEN** the selection is unsaved, unavailable, ambiguous, unconfigured or unsupported in this execution context
- **THEN** Start is refused with a reason without opening devices or selecting a fallback

#### Scenario: Source saved during acquisition
- **WHEN** the global source changes while a session is running
- **THEN** that session retains and displays its launch identity and settings, and the new source requires Stop then Start

### Requirement: Exclusive acquisition ownership

Hands sessions and managed native Hand launches SHALL share one atomic exclusive acquisition lease across workspaces, panels and checkouts within the supported Windows user/logon-session scope. A conflict SHALL identify the owning app or Hands session and require its explicit Stop. A timeout SHALL NOT transfer a lease while its acquisition process can still publish or hold devices.

#### Scenario: App owns acquisition
- **WHEN** Hands Start races or follows a managed native app opening Hand
- **THEN** at most one acquires the lease and opens input, and the loser reports the owning app/session without stopping it

#### Scenario: Module owns acquisition
- **WHEN** a managed built or development native app requests Hand while Hands owns the lease
- **THEN** launch is refused with the Hands owner and stop-first guidance without opening a competing source

#### Scenario: No native hand input
- **WHEN** an app has Hand disabled or uses a separate supported browser XR path
- **THEN** it does not acquire the native hand lease or stop the Hands session

#### Scenario: Owner is slow or inaccessible
- **WHEN** an owner's heartbeat expires but its death or completed input teardown cannot be established
- **THEN** ownership stays unavailable and a recovery reason is shown rather than stealing the lease

### Requirement: Authenticated bounded live transport

Session controls and frames SHALL be restricted to authenticated loopback peers bound to the current panel, owning page and session epoch. Credentials SHALL NOT appear in URLs, logs or saved profiles. Each delivery stage SHALL bound memory and pending work, replacing obsolete frames with the newest rather than accumulating a FIFO. Unauthorized requests SHALL NOT start or stop acquisition.

#### Scenario: Foreign control or socket
- **WHEN** a client presents an invalid origin, host, capability, owner binding or retired session credential
- **THEN** the request or connection is rejected without changing the session or disclosing credentials

#### Scenario: Slow browser
- **WHEN** the page cannot consume frames as fast as acquisition publishes them
- **THEN** pending frames remain bounded, older frames are dropped and measured drop/freshness information remains honest

### Requirement: Frame admission and clock continuity

Every frame SHALL be validated before copying or SDK admission for bounded layout/count, finite values, legal signals and clocks, source identity, epoch and increasing sequence. Capture time SHALL be mapped to page monotonic time with measured clock uncertainty without changing published geometry or gesture capabilities. Invalid, stale, future or retired frames SHALL NOT affect hands or interaction.

#### Scenario: Malformed provider frame
- **WHEN** a provider publishes an invalid size, count, pointer contract, numeric value, confidence, signal or timestamp
- **THEN** it is rejected before admission, a diagnostic is recorded, and repeated invalid output visibly fails the session without a substitute hand

#### Scenario: Delayed previous session
- **WHEN** a frame arrives from a stopped epoch, wrong owner or non-increasing sequence
- **THEN** it is discarded even if a new session has selected the same provider

#### Scenario: Clock discontinuity
- **WHEN** clock mapping resets, uncertainty becomes unacceptable or capture time jumps backwards
- **THEN** existing hands and holds are cleared and no frame is admitted until a fresh valid mapping/session epoch is established

### Requirement: Raw provider recording provenance

The session SHALL expose validated provider-published frames to the retained recorder before global geometry, filtering or scene mapping. New recordings SHALL preserve source, timing, sequence, capabilities and native signals in a bounded versioned provider-stream format without credentials or baked-in global adjustments. Replay SHALL validate provenance and feed the shared pipeline with the recorded portable profile exactly once; existing formats SHALL remain unchanged.

#### Scenario: Record and replay with adjustments
- **WHEN** a live provider stream is recorded while nonidentity global adjustments are active and later explicitly replayed
- **THEN** the file contains the raw published positions and native signals, not adjusted or filtered output
- **AND** replay uses a new epoch and the validated frozen recording-start portable profile once, without also applying the current live profile

#### Scenario: Recording ends or fills
- **WHEN** the source stops, retires its epoch or reaches a recording size, duration or frame-count bound
- **THEN** recording stops visibly with its real source provenance and no new camera session, silent drops or unbounded buffering

### Requirement: Supervised teardown and freshness

Explicit Stop, cancelled Start, crash, owning-page loss, panel shutdown and bounded liveness timeout SHALL retire frame admission, clear hands and held interactions, and end acquisition. Graceful cleanup SHALL quiesce callbacks before destruction. Hung children SHALL be contained and ended within a bounded deadline; ownership SHALL not be advertised free before teardown or verified process death.

#### Scenario: Stop during startup
- **WHEN** Stop is requested while provider creation or start is pending
- **THEN** the request is idempotent, late callbacks cannot enter the SDK and the session ends without retaining cameras or its lease

#### Scenario: Page or panel disappears
- **WHEN** the owner page closes, loses its session heartbeat or the panel exits or crashes
- **THEN** the worker is stopped or contained termination completes, and another session can acquire only after acquisition has ended

#### Scenario: Stream stalls while interaction is held
- **WHEN** a running stream stops delivering fresh frames
- **THEN** the hand and held pinch/drag/pointer state clear within the freshness deadline without generating a click
- **AND** a longer liveness failure ends the session rather than leaving an apparently live stale hand

#### Scenario: Worker dies unexpectedly
- **WHEN** the worker exits without a clean Stop
- **THEN** the page shows failure, its old epoch is retired and a later explicit Start obtains new ownership without automatic restart
