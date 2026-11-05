# hand-signal Specification

## Purpose
Defines the quality of the tracked hand signal the SDK gives every app (lag, jitter, prediction and pinch timing) and
how it is measured, so interaction feel is set by numbers rather than per-app tuning.

## Requirements
### Requirement: Fingertip accuracy at display time
With default settings, the SDK's predicted fingertip SHALL be within 7 mm RMS (p95 within 14 mm) of the tracked
fingertip at the display time, measured by replaying the reference rig recordings.

#### Scenario: Replay of the reference recording
- **WHEN** the replay harness runs the default hand pipeline over the reference rig recording (`rig-2026-10-08.hands`)
  with a 30 ms display lead
- **THEN** the index-tip error against the recorded position 30 ms later is at most 7 mm RMS and 14 mm at p95

### Requirement: Stillness jitter
A hand held still SHALL produce no more rendered fingertip jitter than the unfiltered input provider stream, and below
1 mm RMS frame to frame.

#### Scenario: Still segments of a recording
- **WHEN** the replay harness evaluates segments where the recorded fingertip moves slower than 3 cm/s
- **THEN** the frame-to-frame jitter of the SDK fingertip is below 1 mm RMS and not above that of the raw stream

### Requirement: Bounded overshoot on stop
When a moving fingertip stops, the predicted fingertip SHALL NOT pass the stop point by more than 5 mm once a
tracking sample at rest has arrived (before that, no predictor can know about the stop).

#### Scenario: Synthetic stop
- **WHEN** a synthetic fingertip moves at 0.5 m/s and stops abruptly
- **THEN** after the first sample at rest the predicted position never passes the stop point by more than 5 mm, and
  stays within 2 mm of it from at most 100 ms after the stop

### Requirement: Pinch timing
A pinch SHALL start within 2 tracking frames after thumb and index tip come within the enter distance, and SHALL end
within 2 tracking frames after they separate beyond the exit distance, with exactly one start and one end per pinch.

#### Scenario: Recorded pinch
- **WHEN** a recorded pinch closes and opens once
- **THEN** one pinch start and one pinch end are reported, each no more than 2 tracking frames after its threshold
  crossing

### Requirement: Pinch strength
The SDK SHALL report a continuous pinch strength per hand, 0 when thumb and index are open and 1 at the pinch enter
distance, so apps can show a pinch before it registers.

#### Scenario: Closing fingers
- **WHEN** thumb and index tip move from 8 cm apart to touching
- **THEN** pinch strength rises monotonically from 0 to 1 and the pinch starts once it reaches 1

### Requirement: Hand frame in scene space
For every tracked hand, the SDK SHALL give the fingertip, the pinch point and the palm frame (position and orientation)
in scene space for the current frame, so apps do not derive them from keypoints themselves.

#### Scenario: Palm orientation available
- **WHEN** an app reads a tracked hand in a frame
- **THEN** it gets the palm position and orientation in scene coordinates, consistent with the rendered hand

### Requirement: Recorded-stream measurement
The SDK test suite SHALL replay `.hands` recordings through the same pipeline the page uses and report fingertip
error, stillness jitter, overshoot and pinch timing, failing when a requirement above is not met.

#### Scenario: Regression caught
- **WHEN** a change to smoothing defaults raises the replayed fingertip error above the limit
- **THEN** the SDK tests fail and name the metric that regressed
