# hand-interaction Specification

## Purpose
One interaction model for hands (and the mouse) shared by every app: which target a hand acts on, when it engages and
releases, and how sizes relate to the physical panel, so improvements apply to all apps at once.

## Requirements
### Requirement: Target kinds
The SDK SHALL let an app register interaction targets of four kinds: poke (pressed by a fingertip along its normal),
pinch (taken by a pinch near it), grab (taken by a pinch or fist near or inside it, follows the hand), and volume (reacts
to hand points inside it).

#### Scenario: App registers a pinch target
- **WHEN** an app registers a pinch target with a position and radius and the user pinches within that radius
- **THEN** the target receives a start event with the hand, then move events, then an end event when the pinch ends

### Requirement: One target per hand
Each hand SHALL hover and engage at most one target at a time; when several targets qualify, the nearest one wins.

#### Scenario: Two overlapping targets
- **WHEN** a pinch starts where two pinch targets' radii overlap
- **THEN** only the target nearest the pinch point is engaged

### Requirement: Capture until deliberate release
A pressed or grabbed target SHALL keep its hand until a deliberate release (pinch ends, fist opens, fingertip retracts
past the release depth) or the hand is lost past the grace period. Tracking noise that moves the hand out of the target's
outline SHALL NOT end the interaction.

#### Scenario: Drift during a press
- **WHEN** a fingertip presses a 3 cm button and drifts 1.5 cm sideways out of its outline while still pushed in
- **THEN** the button stays pressed and releases only when the fingertip retracts past the release depth

#### Scenario: Short tracking dropout
- **WHEN** a hand dragging a slider is not tracked for 100 ms
- **THEN** the drag continues when tracking returns, without a release and new grab

### Requirement: Hysteresis on every threshold
Every engage threshold (press depth, pinch radius, volume point count, hover distance) SHALL have a separate, looser
release threshold, so a hand resting at a boundary does not flicker between states.

#### Scenario: Fingertip at press depth
- **WHEN** a fingertip rests exactly at a button's press depth with tracking noise
- **THEN** the button reports one press and no repeated press/release events

### Requirement: Physical sizes
Interaction sizes (radii, margins, depths) SHALL be specified in metres of the physical panel and SHALL behave the
same in every scene mapping (world or camera mapping, any scale).

#### Scenario: Same feel in two mappings
- **WHEN** the same pinch target with a 5 cm radius is used in an app with world mapping at scale 1 and in an app with
  camera mapping at another scale
- **THEN** a pinch 4 cm from the target engages it in both apps, and a pinch 6 cm away engages it in neither

### Requirement: Hover feedback
The SDK SHALL report, per target, whether a hand hovers it and how close the hand is (0..1), so controls can show what a
press or pinch would hit before it happens.

#### Scenario: Approaching a button
- **WHEN** a fingertip approaches a poke target from the front
- **THEN** the target's proximity rises from 0 at the hover distance to 1 at its surface

### Requirement: Mouse parity
The same targets SHALL work with the mouse in a plain browser: hover on mouse-over, press/pinch on button down, drag
while held, release on button up.

#### Scenario: Slider in the browser
- **WHEN** the app runs in a desktop browser without a host and the user drags a slider handle with the mouse
- **THEN** the slider moves exactly as it does with a pinch-drag on the 3D display

### Requirement: Shared tuning
All interaction thresholds SHALL come from one SDK tuning table that apps can override as a whole or per target;
apps SHALL NOT need their own hand-processing code to use the targets.

#### Scenario: Improvement reaches every app
- **WHEN** the default pinch radius in the SDK tuning table changes
- **THEN** every app that uses default-tuned targets picks up the change on rebuild without code changes
