# ui-kit-themes Specification

## Purpose

Allows consuming apps to choose complete UI Kit mesh styles independently while retaining the reference layout, input behavior and resource lifecycle.

## Requirements

### Requirement: Themes supply complete visual styles

A UI Kit theme SHALL supply geometry, material, state-colour and applicable typography styling for every public control and visual primitive. The built-in Default and Chamfer themes SHALL cover every supported variant. Chamfer SHALL visibly differ in mesh profiles and material treatment, not only colours.

#### Scenario: Complete themed control collection
- **WHEN** an app uses Board, pill and round text/icon Buttons, Switch, Segmented, continuous and stepped Sliders, Dial, Trackball, Dialog, Label, Icon and GlassEdge with either built-in theme
- **THEN** every element, title/status, feedback cue and internally owned Close control uses a complete coherent style without missing visual roles

#### Scenario: Geometry-style difference
- **WHEN** corresponding Default and Chamfer controls are shown in matching rest and active states
- **THEN** Chamfer presents its clipped corners, crisp bevels, inset faces or faceted profiles where applicable, with consistent satin materials and legible feedback

#### Scenario: Invalid style selection
- **WHEN** a consumer supplies an unknown theme identifier or an incomplete theme definition
- **THEN** selection fails clearly without destroying the current visuals, interaction state or owned-resource accounting

### Requirement: Default preserves the reference appearance

Omitting a theme SHALL select Default and retain the existing appearance, authored geometry/materials, text metrics and visual animation. Default comparisons in deterministic views SHALL be byte-identical to the reference using matching rendering conditions. Theme support SHALL NOT change product renderer settings to satisfy this guarantee.

#### Scenario: Deterministic Default rendering
- **WHEN** reference and themed builds use matching viewport, camera, fixed clock, assets, input state and deterministic rendering configuration
- **THEN** their Default picture bytes match in mono perspective, orthographic and stereo, including controls, variants, applicable states and consuming app views

#### Scenario: Proof-only antialias control
- **WHEN** a proof harness identically disables antialiasing in reference and themed builds to eliminate measured nondeterminism
- **THEN** deterministic Default pairs remain byte-identical while the runnable apps retain their original renderer defaults

#### Scenario: Existing imperative consumer
- **WHEN** an existing non-component app imports UI Kit and uses its prior constructor forms without theme options
- **THEN** it retains Default behavior and rendering without requiring the component framework or a provider

### Requirement: Theme selection is scoped and declared per consuming app

Apps SHALL select a theme through a scoped provider or controlled prop, with a side-effect-free declared per-app default identifier. Explicit control or scene choices SHALL override inheritance; inherited choices SHALL override app fallback defaults. Omitted selection SHALL fall back to Default without global mutable style or automatic persistence. Explicit project settings SHALL be applied through the existing scene prop; selectors SHALL remain outside app scenes.

#### Scenario: Real consuming apps
- **WHEN** UI Kit or Launcher runs with Default or an explicitly supplied Chamfer selection
- **THEN** its existing controls use that theme within its single SDK runtime and no selector, message or button is introduced inside the app; any declared panel selector uses the conditional component-library settings tab

#### Scenario: Nested and independent consumers
- **WHEN** two consuming subtrees choose different themes and one changes or removes its override
- **THEN** only the affected subtree re-resolves its visuals, app defaults do not mask an explicit surrounding choice and unrelated state remains independent

#### Scenario: Declared default import
- **WHEN** a consumer imports either app's declared theme default and reusable scene without mounting them
- **THEN** it can read the default identifier and supply a controlled selection without starting a renderer, timer, network request or device

#### Scenario: Imperative selection
- **WHEN** a non-component consumer supplies a theme at construction or changes an existing object's theme
- **THEN** the same built-in styles and visual-only switching behavior are available without a provider dependency

#### Scenario: Saved consuming-project selection
- **WHEN** Launcher starts with an explicitly saved UI Kit theme or receives it through a supported live-settings path
- **THEN** the existing scene prop selects that theme for Launcher only, without changing UI Kit's default declaration or introducing theme-selection UI inside Launcher

### Requirement: Themes preserve layout and interaction parity

Themes SHALL NOT change target sizes, poke depths/travel, pinch anchors, volume bounds, layout anchors, timing, sounds, input arbitration or event/value semantics. Visual proportions and typography SHALL fit the reference allocation without reflow, overlap or unusable contact surfaces. Both themes SHALL support identical mouse and hand-only behavior in mono and stereo.

#### Scenario: Paired input replay
- **WHEN** matching mouse and Mouse-disabled sampled-hand sequences exercise every control and behavior variant in perspective, orthographic and stereo
- **THEN** both themes produce equal ordered event traces, sources, values, capture/release behavior and sound triggers, with expected positive activations

#### Scenario: Full variant semantics
- **WHEN** either theme is used for segmented latch/momentary/reselection modes, slider detents, dial rotation, free/axis-locked trackball operation or dialog blocking and Close
- **THEN** existing behavior, interaction feel and target arbitration remain unchanged

#### Scenario: Contact and layout bounds
- **WHEN** a theme changes bevels, thickness, shape or typography
- **THEN** the original control footprint, contact plane, target envelope, text allocation and app layout remain usable without repositioning neighboring components

#### Scenario: Stereo hand and pointer overlap
- **WHEN** off-centre stereo hands operate controls while physical capture and emulated pointer input overlap
- **THEN** SDK projection/capture rules remain authoritative and neither theme creates duplicate activation or re-enables native Mouse input when disabled

### Requirement: Runtime theme switching retains live state

Changing a mounted object's theme SHALL replace visuals without reconstructing its interaction identity, resetting state or emitting input events. Existing held interactions SHALL continue against stable targets. App state, enabled/visible/compact options and explicit visual overrides SHALL survive. Ordinary disable/removal SHALL retain existing clean cancellation semantics.

#### Scenario: Held visual replacement
- **WHEN** selection changes during a mouse press, hand poke, pinch drag or trackball grab
- **THEN** the same control and targets retain capture, pose, value and callbacks through release without a synthesized activation or duplicated registration

#### Scenario: Open dialog and rotating object
- **WHEN** selection changes while a dialog is open or a trackball is rotating
- **THEN** the dialog's blocker/Close state and animation and the trackball's quaternion, velocity, axis and totals remain intact

#### Scenario: Consuming app continuity
- **WHEN** Launcher's theme changes during catalog refresh, paging or an accepted launch
- **THEN** catalog state, page/tilt progress, release delay, navigation deadline and accepted URL are neither restarted nor cancelled by theme replacement

#### Scenario: Disabling or removing a themed object
- **WHEN** a themed object is disabled or removed while captured
- **THEN** existing cancellation rules release it cleanly without later callbacks on retired visuals or an invented click

### Requirement: Visual replacement releases only owned resources

A theme switch SHALL dispose retired owned geometry, materials and textures exactly once and SHALL NOT dispose borrowed inputs, consumer children or the SDK renderer. Repeated switching, development replay and final teardown SHALL leave bounded resources and one live update/registration owner per object. Failed replacement SHALL retire staged resources without damaging the current visuals.

#### Scenario: Repeated switches and final teardown
- **WHEN** controls repeatedly switch Default to Chamfer and back, including dynamic slider fill and nested dialog controls, then unmount twice
- **THEN** superseded resources retire once, live resource/target counts remain bounded and final teardown leaves no owned targets, callbacks or graphics resources

#### Scenario: Borrowed resource survival
- **WHEN** an object with caller-supplied texture maps or caller-added children changes theme or is removed
- **THEN** those borrowed resources and sibling instances remain usable while only the object's owned visual resources are released

#### Scenario: Callback and development updates
- **WHEN** callbacks change, strict development effects replay or hot replacement occurs under a provider
- **THEN** the latest callbacks receive live events, no extra frame loop or duplicate Close update starts and retired callbacks cannot run after cleanup
