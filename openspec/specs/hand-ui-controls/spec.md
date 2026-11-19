# hand-ui-controls Specification

## Purpose
A shared package of 3D controls for 3D-display apps (buttons, switches, sliders, dials, segmented controls, trackball and
labels) built on the shared hand interaction model, so every app gets the same look, feel and fixes.

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

### Requirement: Opt-in segmented re-selection
A segmented control SHALL accept an optional `reselectIndex` naming one of its segments; constructing it with a value that is not the index of a segment SHALL throw a range error. When a hand or mouse activates the already selected segment of a control with `reselectIndex`, the control SHALL select the `reselectIndex` segment instead. Without `reselectIndex`, activating the selected segment SHALL change nothing. Selection by code SHALL never apply `reselectIndex`. Each effective selection change SHALL emit exactly one `change` event with the new index, value and source; a selection that leaves the index unchanged SHALL emit none. A disabled control SHALL ignore hand and mouse activation.

#### Scenario: Selected segment activated again
- **WHEN** a control with options Full, X, Y, Z and `reselectIndex` 0 has X selected and the user activates X
- **THEN** Full becomes selected and one `change` event reports Full with the hand or mouse source

#### Scenario: Another segment
- **WHEN** X is selected in that control and the user activates Y
- **THEN** Y becomes selected

#### Scenario: Fallback segment already selected
- **WHEN** Full is selected in that control and the user activates Full
- **THEN** Full stays selected and no `change` event is emitted

#### Scenario: No fallback or selection by code
- **WHEN** a control without `reselectIndex` has its selected segment activated, or code selects the current index of any control
- **THEN** the selection is unchanged and no `change` event is emitted

#### Scenario: Disabled control
- **WHEN** a disabled control receives a hand or mouse activation
- **THEN** its selection does not change

#### Scenario: Invalid fallback
- **WHEN** a control with three segments is constructed with `reselectIndex` 3
- **THEN** construction throws a range error
