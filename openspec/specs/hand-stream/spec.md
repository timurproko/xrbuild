# hand-stream Specification

## Purpose
Delivers the input provider's hand tracking results to the web app as a low-latency stream of hand frames over the host channel. Frames use the same panel coordinate frame as the eye poses, so hands line up with displayed content whatever tracker is used.

## Requirements
### Requirement: Hand frame content
Each hand frame SHALL carry a capture timestamp, a monotonically increasing sequence number, the tracking rate, the provider's declared capabilities, and up to two hands, each with a persistent ID, handedness and 21 keypoints in the common hand landmark order (wrist, then four joints per finger from thumb to little finger) (position in metres, confidence), plus per-finger pinch, grab and palm frame when declared.

#### Scenario: Two hands in view
- **WHEN** two hands are tracked
- **THEN** the frame contains two hand entries, each with 21 keypoints and a distinct hand ID

#### Scenario: No hands
- **WHEN** no hand is tracked
- **THEN** frames are still emitted at the tracking rate with an empty hand list

#### Scenario: Provider without palm frame
- **WHEN** the input provider does not declare the palm capability
- **THEN** frames carry its hands with keypoints and the capabilities show that the palm frame is not supplied

### Requirement: Panel coordinate frame
Hand positions SHALL use the panel frame of the eye pose feed: origin at the panel centre, +X right, +Y up along the panel surface, +Z toward the viewer, in metres. The input provider SHALL derive them from its own rig calibration; the host does not correct them.

#### Scenario: Fingertip touches the glass centre
- **WHEN** a fingertip physically touches the centre of the display's front surface
- **THEN** the reported index fingertip position is within 1.5 cm of (0, 0, d), where d is the configured glass-to-panel offset

#### Scenario: Calibration missing
- **WHEN** the input provider finds no calibration for the connected sensors, or the calibration does not match them
- **THEN** the page receives a `needs-setup` status, the mismatch is logged, and no hands are emitted in an arbitrary frame

### Requirement: Stable hand identity
A hand's ID SHALL stay the same while that physical hand is continuously tracked, and across tracking dropouts of up to 300 ms when the hand reappears within 15 cm of its last position.

#### Scenario: Brief dropout
- **WHEN** a tracked hand disappears for 200 ms and reappears near its last position
- **THEN** it is reported with the same ID it had before the dropout

### Requirement: Freshness over completeness
The stream SHALL always deliver the newest available result and SHALL drop older unsent frames rather than queue them. The time from camera capture to the frame being available to the page SHALL be at most 50 ms at the 95th percentile on the reference rig.

#### Scenario: Page stalls briefly
- **WHEN** the page does not consume frames for 500 ms
- **THEN** the next frame it receives is the most recent one, not the oldest buffered one

### Requirement: Tracking rate under display load
While the app renders on the 3D display at its target frame rate, hand tracking on the reference rig SHALL produce at least 45 results per second.

#### Scenario: App on glass
- **WHEN** the reference web app is displayed on the 3D display and a hand moves continuously for 60 seconds
- **THEN** the average tracking rate reported in frames is at least 45 Hz

### Requirement: Service health reporting
The stream SHALL report the input provider's status to the page as `starting`, `running`, `needs-setup` (not calibrated), `device-missing` (sensor missing) or `failed`, with a message and the current tracking rate. The host SHALL keep running and displaying content when hand tracking is unavailable.

#### Scenario: Camera unplugged
- **WHEN** a tracking sensor of the input provider is disconnected while the app runs
- **THEN** the page receives a `device-missing` status within 2 seconds and the app keeps rendering
