# Spec Delta

## MODIFIED Requirements

### Requirement: Honest live session states and rates

Hands SHALL distinguish Not started, Starting, Running, Running but no hands detected, Stalled, Stopping, Failed with reason, and Stopped compactly on or beside Start/Stop, in fps chips and viewport feedback. Rejected observations SHALL have counted non-fatal feedback. Tracking fps SHALL derive from valid session frames and frame age from mapped capture time. Unavailable measurements SHALL remain unavailable. Start SHALL return only after owned teardown, never remain permanently Stopping.

#### Scenario: Running with hands
- **WHEN** fresh valid frames contain hands
- **THEN** status shows Running, source identity, observed tracking rate and frame age, and the header tracking chip reflects those frames

#### Scenario: Running with no detection
- **WHEN** fresh valid frames contain zero hands
- **THEN** status says Running but no hands detected, the hand view is empty and capture rate continues to reflect actual received frames

#### Scenario: Failure or no frames yet
- **WHEN** startup fails or a running worker has not delivered a fresh valid frame
- **THEN** the view remains empty and reports the provider's bounded reason or waiting/stalled state without claiming no detection from missing data

#### Scenario: Explicit Stop
- **WHEN** Stop completes
- **THEN** status says Stopped, the tracking chip is unavailable and no old hands or active test holds remain
- **AND** the provider has ended, ownership is released and the button is enabled Start for an available saved source

#### Scenario: Isolated rejection remains recoverable
- **WHEN** a malformed provider observation is dropped during live tracking
- **THEN** compact feedback exposes its count and rejected value kind and joint index when applicable without an immediate Failed badge or synthetic replacement
- **AND** valid subsequent frames continue to supply real tracking metrics

#### Scenario: Failure has completed cleanup
- **WHEN** a failed session completes cleanup
- **THEN** its failure reason remains reportable, local retired/stopping flags are cleared before terminal controls render, and Start is available without false Busy on its own leftovers

#### Scenario: Stalled input resumes or times out
- **WHEN** input is Stalled and no fresh frame is available
- **THEN** tracking fps shows a dash and old hands and holds remain cleared
- **AND** fresh input resumes tracking automatically, or bounded liveness expiry ends and joins acquisition before Start is offered with a clear timeout reason

## ADDED Requirements

### Requirement: Actionable Hands ownership recovery

Hands SHALL distinguish its own draining acquisition from a different live owning page. Explicit Start SHALL automatically reconcile stale same-page or failed/dead same-panel ownership. Genuine live-page contention SHALL expose an explicit take-over action that requires authenticated authorization and completed old-worker teardown before capture starts. Reload SHALL NOT leave permanent stale Busy or silently start capture.

#### Scenario: Same page or failed session remains recorded
- **WHEN** a page requests Start after failure or stop and its own stale session remains recorded
- **THEN** it completes bounded recovery rather than showing another-page Busy or a permanently disabled Stopping button

#### Scenario: Another live page owns Hands
- **WHEN** a different live Hands page owns acquisition
- **THEN** Busy accurately identifies contention and an enabled explicit take-over action is offered
- **AND** taking over cannot overlap provider processes or target a replacement owner through a stale response

#### Scenario: Page reload
- **WHEN** the person reloads Hands during or after a failed/stalled session
- **THEN** the old page's session is retired and drained, navigation starts no device, and the next explicit Start can acquire after verified cleanup
