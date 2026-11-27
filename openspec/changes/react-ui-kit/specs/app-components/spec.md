# Spec Delta

## MODIFIED Requirements

### Requirement: Hello Cube retains its app contract

The component-based Hello Cube SHALL remain visually and functionally identical to its vanilla baseline, retaining its scene, animation, controls, selection, diagnostics, relative asset URLs, icon entry and build output. Existing vanilla SDK apps and imperative UI Kit consumers SHALL remain supported without React adoption. Migrating UI Kit, Launcher and newly generated templates SHALL NOT change any app's visible UI or behavior or rewrite existing user projects.

#### Scenario: Matched baseline comparison
- **WHEN** baseline and component builds are captured at matching viewport, clock, camera pose, projection and input state
- **THEN** their pictures match within recorded renderer noise and the same input sequences produce identical observable behavior, with no intentional visual difference

#### Scenario: Runnable production sample
- **WHEN** the Hello Cube production build is opened in mono or stereo
- **THEN** its scene and selection behavior remain available from the existing app output location with relative asset loading

#### Scenario: Icon rendering
- **WHEN** Hello Cube is opened in icon mode or its standalone icon entry is imported
- **THEN** its existing icon subject/export remains usable without an extra component-runtime draw or mounted application from the icon import

#### Scenario: Vanilla compatibility
- **WHEN** an existing vanilla SDK app or imperative UI Kit consumer is built
- **THEN** it does not require React adoption and retains its existing frame, hand, camera and disposal behavior

## ADDED Requirements

### Requirement: UI Kit components preserve control behavior

Every public UI Kit control and visual primitive SHALL be available as a reusable component inside the shared SDK runtime. Components SHALL preserve authored geometry, materials, labels, animation, sounds, enabled state and existing event semantics for hand and mouse input. A reusable board surface SHALL preserve its consuming app's authored dimensions and appearance.

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

### Requirement: UI Kit component lifetimes are isolated

Unmounting or replacing a UI Kit component SHALL release its SDK registrations, callbacks and owned graphics/audio resources without affecting siblings or borrowed resources. Updating event callbacks SHALL NOT recreate the control, reset its value or interrupt capture. Listener removal SHALL be available to imperative consumers without breaking existing chainable subscription calls.

#### Scenario: Callback replacement and removal
- **WHEN** a mounted control's callback changes during a held interaction and the component is later removed
- **THEN** the latest callback receives subsequent live events, and no retired callback fires after cleanup

#### Scenario: Removal while captured
- **WHEN** a captured control is unmounted, disabled or replaced
- **THEN** the SDK cancels capture without synthesizing activation or leaving a held target, and later frames do not update retired resources

#### Scenario: Repeated development mount
- **WHEN** development effect replay, hot replacement and repeated mount/unmount occur
- **THEN** each live control has only one target/subscription/update owner and resources created by abandoned mounts do not leak

#### Scenario: Two component consumers
- **WHEN** two instances of an exported control or showcase are mounted and one is removed
- **THEN** their values and subscriptions remain independent and the surviving instance continues normally

### Requirement: UI Kit and Launcher expose reusable app components

UI Kit and Launcher SHALL each have a runnable entry and a side-effect-free public component entry. Launcher SHALL compose its controls by importing UI Kit's public app component export at build time. Public imports SHALL NOT mount another app, create a renderer, start catalog/network work or request devices; the consumer SHALL supply the sole runtime.

#### Scenario: Launcher consumes the UI Kit app library
- **WHEN** Launcher is built and mounted using UI Kit's exported controls
- **THEN** its board, labels, dialogs and buttons use those components within Launcher's runtime without executing the UI Kit showcase bootstrap

#### Scenario: Import-only consumer
- **WHEN** a separate app imports UI Kit or Launcher components without mounting them
- **THEN** no canvas, frame loop, catalog timer or device request starts and the components are bundled into the consumer

### Requirement: Migrated apps retain appearance and interaction

UI Kit, Launcher and generated template apps SHALL retain their existing appearance and behavior in mono perspective, orthographic and stereo views. Their production builds SHALL retain relative asset loading, standalone icon exports and icon-mode output. No intentional picture difference or changed input policy is permitted by this re-architecture.

#### Scenario: Deterministic paired pictures
- **WHEN** before and after builds use the same clock, camera, viewport, pixel ratio, assets and input state in each view mode
- **THEN** paired pictures are byte-identical or any pixel tolerance is measured and justified solely by reproducible renderer noise, not an intentional scene change

#### Scenario: UI Kit interaction replay
- **WHEN** identical mouse and hand sequences exercise every interactive control, dialog occlusion, trackball axes and the Interactable switch
- **THEN** event order, event sources, values, enabled behavior and visible feedback match the baseline, including Mouse-off and stereo hand operation

#### Scenario: Launcher interaction replay
- **WHEN** identical catalog fixtures and input sequences exercise paging, swipe, tilt, launch/release, loading, refresh and XR availability
- **THEN** layout, animations, icon fallbacks, action timing, catalog ordering/errors and return/projection URLs remain unchanged

#### Scenario: Icon and production routes
- **WHEN** each migrated app is built and opened under a nested relative route, in icon mode, or through its standalone icon export
- **THEN** existing assets and icon subjects load without an extra application mount, ordinary scene contamination or runtime module sharing

### Requirement: New apps are runnable component libraries

The canonical template SHALL generate a runnable component app with a separate side-effect-free public component export. The generated text scene, name substitution, animation, icon/theme assets, notices and runtime defaults SHALL retain their prior behavior. Another app SHALL be able to import and bundle its components through source aliases without executing its bootstrap.

#### Scenario: New project creation
- **WHEN** a named app is generated from the canonical template and built
- **THEN** it runs the same authored text/ring scene and exposes that scene as reusable components without requiring manual runtime setup changes

#### Scenario: Reusing a generated component
- **WHEN** a consumer imports the generated app's public entry and renders it in its own runtime
- **THEN** only the consumer's renderer and frame loop run and component state/resources are local to that instance
