# input-provider Specification

## Purpose
Defines how any hand tracking source delivers hands to the core and the page in one neutral form, so apps and the SDK
never depend on a specific tracker.

## Requirements
### Requirement: Neutral hand frame
An input provider SHALL deliver hands as frames of zero or more hands, each with a stable id, handedness and 21
keypoints in the common 21-point hand landmark order (wrist, then four joints per finger from thumb to little finger)
with per-keypoint confidence, in the panel frame in metres, plus the capture time of its newest sensor data on the
host clock.

#### Scenario: Same app, different trackers
- **WHEN** an app runs once with a hand tracking input plugin and once with the `replay` provider playing a recording of that plugin
- **THEN** the page receives hands in the same format and frame, and the app needs no change

#### Scenario: Stable id
- **WHEN** a hand stays tracked across consecutive frames
- **THEN** it keeps the same id; a short dropout bridged by the provider also keeps the id

### Requirement: Provider frame correction belongs to the provider
An input provider SHALL deliver positions already in the panel frame (origin at the panel centre, +X right, +Y up the
panel, +Z toward the viewer). Sensor calibration and rig correction SHALL be the provider's responsibility.

#### Scenario: Calibration missing
- **WHEN** a provider that needs a calibration starts without it
- **THEN** it reports status `needs-setup` with a message naming what is missing, and delivers no hands

### Requirement: Declared capabilities
An input provider SHALL declare which optional fields it supplies: pinch per finger, grab, palm pose. The core and SDK
SHALL derive missing gestures from the keypoints, so every app sees pinch and grab events from every provider.

#### Scenario: Provider without gestures
- **WHEN** a provider declares no pinch and no grab capability
- **THEN** the SDK still emits `pinchstart`/`pinchend` and `grabstart`/`grabend`, computed from the keypoints

#### Scenario: Provider with native grab
- **WHEN** a provider declares grab and sets it on a hand
- **THEN** the SDK uses the provider's grab state for that hand

### Requirement: Generic provider status
An input provider SHALL report a status of `starting`, `running`, `needs-setup`, `device-missing` or `failed`, with a
human-readable message and its tracking rate. The host SHALL forward it to the page and to `@status`.

#### Scenario: Camera unplugged
- **WHEN** the provider's device is not found at start
- **THEN** the page and the control panel show `device-missing` with the provider's message

### Requirement: Optional debug images
An input provider MAY publish debug images (for example camera frames with detection boxes). The host SHALL forward
them unchanged to clients that request them and SHALL NOT publish them when no client asked.

#### Scenario: Camera view in the panel
- **WHEN** the control panel runs an app with the camera view on and the provider publishes debug images
- **THEN** the panel shows each image stream the provider labels, whatever the provider is

#### Scenario: No client asked
- **WHEN** no client has requested debug images
- **THEN** the host sends none

### Requirement: Built-in neutral providers
The core SHALL include the input providers `none` (no hands), `replay` (plays a recorded hand stream at its original
timing, optionally looping) and `simulated` (scripted hands for tests).

#### Scenario: Replay for tests
- **WHEN** the host runs with `--input=replay --plugin.replay.file=out/touch.hands`
- **THEN** the page receives the recorded hands with the recorded timing, with no camera connected

### Requirement: Hand recording
The host SHALL record the neutral hand stream and provider status of any provider to a file when asked, in the format
the `replay` provider plays.

#### Scenario: Record any provider
- **WHEN** the host runs with any input provider and `--record-hands=out.hands`
- **THEN** `out.hands` replays the same session with `--input=replay`
