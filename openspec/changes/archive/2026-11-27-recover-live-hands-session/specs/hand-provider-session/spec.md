# Spec Delta

## MODIFIED Requirements

### Requirement: Exclusive acquisition ownership

Hands sessions and managed native Hand launches SHALL share one atomic exclusive acquisition lease across workspaces, panels and checkouts within the supported Windows user/logon-session scope. A conflict SHALL identify a genuinely live owner. Same-page or dead/failed same-panel ownership SHALL drain automatically on explicit Start. A different live Hands page SHALL offer explicit authenticated takeover, never timeout-based theft or termination of an unrelated app.

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
- **THEN** ownership stays unavailable with a bounded recovery action and reason rather than stealing the lease

#### Scenario: Explicit Start meets its own leftovers
- **WHEN** Start finds same-page ownership or a dead/failed Hands session in the same panel
- **THEN** the service fences old work, completes owned teardown and releases ownership before starting the selected source without a false foreign-page Busy state

#### Scenario: Different live page owns acquisition
- **WHEN** a different live Hands page owns acquisition
- **THEN** the requesting page identifies genuine contention and offers an explicit authenticated take-over action
- **AND** takeover stops and joins that designated Hands worker before reserving again, without controlling unrelated applications or accepting stale ownership targets

#### Scenario: Page reload or panel restart
- **WHEN** the page reloads or the owning panel restarts
- **THEN** stale page/session ownership is retired and drained without user-profile edits, automatic capture or permanent Busy
- **AND** the next explicit Start waits for the previous acquisition process to end before acquiring

### Requirement: Frame admission and clock continuity

Every frame SHALL be validated before copying or SDK admission for bounded layout/count, finite values, legal signals and clocks, source identity, epoch and increasing sequence. Legitimate ABI values SHALL remain valid. A malformed hand or frame SHALL contribute no hand input and a counted non-fatal diagnostic; only persistent broken output SHALL fail acquisition. Capture time SHALL retain measured monotonic mapping. Invalid, stale, future or retired values SHALL NOT affect hands or interaction.

#### Scenario: Malformed provider frame
- **WHEN** a provider publishes an invalid size, count, pointer contract, numeric value, confidence, signal or timestamp
- **THEN** malformed data is excluded before admission, unsafe whole frames become empty observations where a safe clock/header exists, and a bounded diagnostic is recorded without fabricated hands
- **AND** a single rejected observation does not end acquisition, while persistently broken output ends with a clear reason and verified teardown

#### Scenario: Legitimate empty or low-confidence values
- **WHEN** an ABI-valid frame contains zero confidence, zero-filled optional data or no detected hands
- **THEN** it remains valid without invented joint positions, confidence rescaling or a session failure

#### Scenario: One malformed hand among valid peers
- **WHEN** a safely bounded frame contains a malformed hand and a valid hand
- **THEN** the malformed hand is excluded, the valid peer is retained and the visible rejection counter advances

#### Scenario: Isolated malformed observations
- **WHEN** valid input resumes between sporadic malformed observations
- **THEN** earlier lifetime rejects do not accumulate into a persistent-stream failure
- **AND** old held interactions cannot survive a resulting empty observation

#### Scenario: Reportable rejection diagnostic
- **WHEN** rejection is shown during acquisition or in a persistent-stream failure
- **THEN** compact feedback includes a bounded rejected-value kind and joint index when applicable, plus counts, without raw poses, credentials, private paths or images

#### Scenario: Delayed previous session
- **WHEN** a frame arrives from a stopped epoch, wrong owner or non-increasing sequence
- **THEN** it is discarded even if a new session has selected the same provider

#### Scenario: Clock discontinuity
- **WHEN** clock mapping resets, uncertainty becomes unacceptable or capture time jumps backwards
- **THEN** existing hands and holds are cleared and no frame is admitted until a fresh valid mapping/session epoch is established

### Requirement: Supervised teardown and freshness

Explicit Stop, cancelled Start, failure, crash, owning-page loss, panel shutdown and bounded liveness timeout SHALL retire input, clear held interactions and end acquisition. Graceful cleanup SHALL quiesce callbacks before destruction. Hung owned children SHALL be forcibly contained and joined within a bounded deadline. The lease SHALL release exactly once after cleanup or verified death, and client controls SHALL settle without permanent Stopping or offering Start before teardown completes.

#### Scenario: Stop during startup
- **WHEN** Stop is requested while provider creation or start is pending
- **THEN** the request is idempotent, late callbacks cannot enter the SDK and the session ends without retaining cameras or its lease

#### Scenario: Page or panel disappears
- **WHEN** the owner page closes, loses its session heartbeat or the panel exits or crashes
- **THEN** the worker is stopped or contained termination completes, and another session can acquire only after acquisition has ended

#### Scenario: Stream stalls while interaction is held
- **WHEN** a running stream stops delivering fresh frames
- **THEN** the hand and held pinch/drag/pointer state clear within the freshness deadline without generating a click
- **AND** fresh valid input recovers the existing session, or a longer liveness failure drains it to a terminal state with a clear reason and Start available only after teardown

#### Scenario: Worker dies unexpectedly
- **WHEN** the worker exits without a clean Stop
- **THEN** the page shows failure, its old epoch is retired and a later explicit Start obtains new ownership without automatic restart

#### Scenario: Failure during stop or stalled cleanup
- **WHEN** graceful teardown hangs or a stop request fails or never answers
- **THEN** the owning service forces only its contained child to end, verifies completion and releases its lease
- **AND** the page resolves its stopping state through bounded reconciliation, retains the failure reason and does not label its own draining session as another page

#### Scenario: Slow provider startup
- **WHEN** provider startup is slow or never publishes a usable frame
- **THEN** startup/waiting remains distinct from fresh empty detection, no tracking rate is fabricated, and bounded startup/liveness cleanup precedes a new Start
