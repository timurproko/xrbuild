# Spec Delta

## MODIFIED Requirements

### Requirement: UI Kit components preserve control behavior

Every public UI Kit control and visual primitive SHALL be available as a reusable component inside the shared SDK runtime. Default SHALL preserve authored geometry, materials and labels; explicitly selected themes SHALL change visuals only within fixed layout and contact bounds. All themes SHALL preserve animation timing, sounds, enabled state and event semantics for hand and mouse input. Board SHALL preserve consuming apps' authored dimensions.

#### Scenario: Complete component coverage
- **WHEN** a consumer composes a board, pill and round buttons, switch, segmented control, continuous and stepped sliders, dial, trackball, dialog, label, icon and glass edge
- **THEN** each renders and, where interactive, responds with the same observable values and event sources as its imperative equivalent

#### Scenario: Frame-driven controls
- **WHEN** the SDK advances a mono or stereo frame
- **THEN** each mounted control updates once from the SDK delta and a dialog's internally owned Close control is not updated twice

#### Scenario: Hand-only control operation
- **WHEN** Mouse is disabled and replayed hands poke, pinch or grab a control in mono perspective, orthographic or stereo
- **THEN** the physical interaction retains its baseline capture, value and release behavior while native mouse input cannot activate the control

#### Scenario: Physical and emulated input overlap
- **WHEN** a hand captures a control and also generates emulated pointer events
- **THEN** the control activates only through the existing SDK interaction arbitration without an extra component activation

#### Scenario: Alternate visual theme
- **WHEN** a consumer explicitly selects a complete alternate theme for its UI Kit components
- **THEN** their mesh profiles and materials can differ while target geometry, app layout and input/value semantics remain the same as Default

### Requirement: Migrated apps retain appearance and interaction

UI Kit, Launcher and generated template apps SHALL retain their default appearance and behavior in mono perspective, orthographic and stereo. UI Kit and Launcher SHALL permit explicitly selected visual themes without changing layout or input policy. Production builds SHALL retain relative assets, standalone icons and icon-mode output. Deterministic Default pictures SHALL be byte-identical to the reference; alternate visuals SHALL NOT weaken interaction parity.

#### Scenario: Deterministic paired pictures
- **WHEN** before and after builds use the same clock, camera, viewport, pixel ratio, assets and input state in each view mode with the default appearance
- **THEN** deterministic paired pictures are byte-identical; nondeterministic product-renderer comparisons are disclosed separately and cannot excuse a deterministic mismatch

#### Scenario: UI Kit interaction replay
- **WHEN** identical mouse and hand sequences exercise every interactive control, dialog occlusion, trackball axes and the Interactable switch
- **THEN** event order, event sources, values, enabled behavior and visible feedback match the baseline, including Mouse-off and stereo hand operation

#### Scenario: Launcher interaction replay
- **WHEN** identical catalog fixtures and input sequences exercise paging, swipe, tilt, launch/release, loading, refresh and XR availability
- **THEN** layout, animations, icon fallbacks, action timing, catalog ordering/errors and return/projection URLs remain unchanged

#### Scenario: Icon and production routes
- **WHEN** each migrated app is built and opened under a nested relative route, in icon mode, or through its standalone icon export
- **THEN** existing assets and icon subjects load without an extra application mount, ordinary scene contamination or runtime module sharing

#### Scenario: Explicit themed app composition
- **WHEN** UI Kit or Launcher receives an explicit theme prop or surrounding provider choice
- **THEN** only its UI Kit visuals change, Launcher still consumes UI Kit's public app export and neither app adds theme-selection UI or starts another runtime
