# hand-ui-controls Specification

## Purpose
A shared package of 3D controls for 3D-display apps (buttons, switches, sliders, dials, trackball and labels) built on the
shared hand interaction model, so every app gets the same look, feel and fixes.

## Requirements

### Requirement: Shared controls package
The core SHALL provide a controls package (`@xr-build/ui-kit`) with button (pill and round), switch, segmented control,
slider, stepped slider, dial, trackball and text label, usable from any app.

#### Scenario: App uses a shared button
- **WHEN** an app imports the button from the controls package and adds it to its scene
- **THEN** the button responds to poke and mouse without any hand-handling code in the app

### Requirement: Reachable target sizes
With default settings, each control's hand-active area SHALL be at least 3 cm across, and pinch-taken handles SHALL
engage within 5 cm of their centre.

#### Scenario: Off-centre poke
- **WHEN** a fingertip pokes a button 1 cm outside its visible edge
- **THEN** the press registers

### Requirement: Press feedback follows the finger
A pressed surface SHALL follow the fingertip without visible lag on the way in, and SHALL show hover proximity before
contact.

#### Scenario: Slow press
- **WHEN** a fingertip pushes a button cap slowly
- **THEN** the cap depth matches the fingertip depth each frame until the press point, and the click fires there

### Requirement: Enabled state
Each control SHALL have an enabled state; a disabled control is dimmed, ignores hand and mouse input and drops any
press or grab in progress.

#### Scenario: Disable during a drag
- **WHEN** a slider is disabled while a hand drags it
- **THEN** the drag ends, the value stays, and further hand input is ignored until it is enabled again

### Requirement: Control events
Each control SHALL emit events for its changes (click, change, grab, release, rotate) with the input source (hand mode
or mouse), so apps react the same way to hand and mouse.

#### Scenario: Slider change by pinch
- **WHEN** a pinch drags a slider to a new value
- **THEN** the slider emits grab with mode pinch, change events with the new value, then release

### Requirement: Momentary segmented cap presentation
Segmented controls SHALL support an opt-in presentation where selected caps do not remain physically depressed. The showcase Full/X/Y/Z control SHALL use this presentation and ordinary radio selection without automatic re-selection fallback.

#### Scenario: Select an axis again
- **WHEN** the user activates the selected X, Y or Z with hand or mouse
- **THEN** selection stays unchanged and the cap returns to rest after release while remaining highlighted

#### Scenario: Restore full rotation
- **WHEN** the user activates Full
- **THEN** Full becomes selected and its cap returns to rest after release
