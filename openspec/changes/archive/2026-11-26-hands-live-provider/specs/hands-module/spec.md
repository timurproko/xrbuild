# Spec Delta

## MODIFIED Requirements

### Requirement: Minimal provider picker with availability

Hands SHALL put Start/Stop atop the left sidebar above the autosaving Skeleton provider and optional installed post-processing controls. State SHALL stay compact in the controls, fps chips and viewport message. Selection SHALL save silently, retain missing identities and offer inline error/retry. Acquisition SHALL keep its launch source until Stop. Routine sidebar prose, Save/Reload, recording UI and generated substitutes SHALL remain absent.

#### Scenario: Saved source unavailable
- **WHEN** the chosen provider is disabled, missing or failed
- **THEN** Hands retains and labels that option without selecting a replacement or routine availability prose

#### Scenario: Installed but not started
- **WHEN** a source is installed and enabled but no run has checked its device
- **THEN** the compact Start control does not claim hardware is connected or running, and no separate not-started sentence appears

#### Scenario: Standalone live session not available
- **WHEN** the standalone session runtime is missing, outdated or unsupported on this platform
- **THEN** the hand view stays idle with the concrete unavailable/Rebuild reason, without starting a full host or fabricating provider frames

#### Scenario: Explicit live delivery replaces page-only idle
- **WHEN** the person starts the saved selected provider and valid session frames arrive
- **THEN** the viewport shows those actual hands through the shared SDK adapter
- **AND** before Start it shows no hand, with compact Start guidance confined to the control/viewport rather than sidebar prose or cached app history

#### Scenario: Non-live data is not provider input
- **WHEN** calibration data or replay is available
- **THEN** it does not impersonate the selected provider's live hand

#### Scenario: Source Save independent of tools
- **WHEN** the person selects a provider while an adjustment edit is unfinished
- **THEN** only source selection is saved, without committing/discarding that edit, starting acquisition or switching a running app's source

#### Scenario: Selection save fails
- **WHEN** saving a selected provider fails
- **THEN** a short inline error and retry preserve the unsaved selection without a success claim

#### Scenario: Source draft differs from session
- **WHEN** the person edits or saves another source while a session is active
- **THEN** the active provider remains identified separately and Stop remains available for that session
- **AND** a different source cannot start until the active session has stopped and its source choice is saved

## ADDED Requirements

### Requirement: Honest live session states and rates

Hands SHALL distinguish Not started, Starting, Running, Running but no hands detected, Stopping, Failed with reason, and Stopped compactly on or beside Start/Stop, in the fps chips and viewport message, without adding sidebar status sentences. Tracking fps SHALL derive from valid session frames, separately from render fps; frame age SHALL derive from mapped capture time. Unavailable measurements SHALL remain unavailable, never fixture motion or cached app rates.

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

### Requirement: Live viewport shares applied app semantics

Session frames SHALL pass through the same validated applied global profile, canonical ingress, default filtering, gestures, scene mapping and standard drawing as managed apps. Geometry SHALL be applied exactly once. Committed immediate adjustment edits SHALL distinguish persistence from actual session application and retain the running source. There SHALL be no Apply button, and unfinished or invalid edits SHALL NOT change live input.

#### Scenario: Same frame and profile
- **WHEN** Hands and an app process equivalent source frames, clocks and applied profiles
- **THEN** their processed hand positions, size, gestures and standard appearance agree without a second geometry transform

#### Scenario: Apply while holding
- **WHEN** changed geometry is committed immediately during pinch or drag
- **THEN** shared SDK cleanup releases the hold without click, clears old filter state and acknowledges the new session-bound profile only after application
- **AND** an appearance-only commit changes drawing without releasing that hold or altering acquisition

#### Scenario: Delivery fails after save
- **WHEN** profile persistence succeeds but the viewport does not acknowledge application
- **THEN** Hands says saved but live delivery failed rather than Applied, and retains the last valid applied snapshot

### Requirement: Real-session interaction checks

Hands SHALL offer a small pinch target and draggable target using the shared SDK interaction path and current session hand. Test feedback SHALL clear on no hands, staleness, geometry reset, Stop, failure or disposal. It SHALL NOT use generated poses or count mouse actions as evidence of tracked-hand success.

#### Scenario: Live pinch and drag
- **WHEN** the current session hand pinches the test target or grabs and moves the drag target
- **THEN** visible feedback reflects shared SDK events and the drag follows the processed hand

#### Scenario: Discontinuity while dragging
- **WHEN** tracking becomes stale or the session stops while a target is held
- **THEN** the target is released without a click and late old frames cannot resume the hold
