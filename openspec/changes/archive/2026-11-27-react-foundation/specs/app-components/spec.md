# Spec Delta

## Purpose

Allows applications to compose and export reusable scene components while the existing SDK remains responsible for rendering, projection, input and runtime lifecycle.

## ADDED Requirements

### Requirement: Components share the SDK runtime

Opt-in component applications SHALL use the SDK-owned renderer, scene and managed camera. The SDK SHALL remain the sole animation-loop and final-draw owner. Component integration SHALL NOT introduce an independent canvas runtime, renderer, resize policy or XR session owner.

#### Scenario: Ordinary component frame
- **WHEN** a component application receives an SDK frame
- **THEN** component updates occur once and one SDK render submission draws the resulting scene, without an additional component-runtime draw

#### Scenario: Immersive session transition
- **WHEN** an application enters and exits an immersive session
- **THEN** the SDK continues to own the session and animation callback and component updates continue once per delivered SDK frame

### Requirement: Components share frame time and sampled hands

Component frame callbacks SHALL receive SDK-derived elapsed time and delta, including during immersive sessions. Current hand access SHALL expose the SDK's processed hands rather than another acquisition or gesture pipeline. Component frame work SHALL run after hand sampling and before interaction resolution and final drawing.

#### Scenario: Fresh hand sample
- **WHEN** a new provider skeleton sample is accepted for a frame
- **THEN** the component frame callback reads that frame's processed hands before SDK interaction and drawing use them

#### Scenario: Several frame subscribers
- **WHEN** several components register frame callbacks and the application restarts its loop
- **THEN** each active callback runs once per frame with a common clock and nonnegative delta, without a wall-clock-sized first delta

### Requirement: Projection and eye sizing remain authoritative

Component integration SHALL preserve SDK canvas sizing, pixel ratio, camera identity and projection. Live mono perspective/orthographic switching SHALL retain authored pose and framing. Stereo and immersive views SHALL retain SDK perspective eye projections and per-eye dimensions irrespective of the mono projection selection.

#### Scenario: Mono projection and resize
- **WHEN** a component application switches mono projection and resizes repeatedly
- **THEN** the managed camera retains its identity and expected framing and the component runtime does not overwrite its projection or output dimensions

#### Scenario: Side-by-side stereo
- **WHEN** a stereo frame draws two eyes
- **THEN** component frame callbacks run once, the SDK draws its two eye views, and the canvas remains correctly sized for both eyes

### Requirement: Component events use SDK picking and capture

Component pointer handlers SHALL receive events selected by SDK picking, using SDK mono/stereo rays and input policy. Existing hand targets SHALL retain nearest-target arbitration and capture through release or loss. Hand-pointer emulation SHALL NOT deliver a second component activation for the same captured gesture. Cancelled or retired interactions SHALL NOT synthesize clicks.

#### Scenario: Mouse and emulated hand selection
- **WHEN** a mouse click or uncaptured hand-pointer click selects a registered component mesh
- **THEN** its handler runs once with the SDK-selected hit, and a miss can clear selection

#### Scenario: Captured target excludes duplicate activation
- **WHEN** a hand captures a registered physical interaction target and also produces emulated pointer events
- **THEN** the captured target receives its interaction lifecycle without a second component click from that hand's emulation

#### Scenario: Target unmounted while held
- **WHEN** a held component target is removed, disabled or loses its hand
- **THEN** SDK capture ends with the appropriate cancellation reason and no click is synthesized

### Requirement: Component lifetimes release only owned resources

Component mounting SHALL tolerate development double-mount checks, hot replacement and repeated disposal without duplicate loops, listeners, targets or callbacks. Disposal SHALL cancel pending setup and remove component resources. Detaching components from a caller-owned runtime SHALL NOT dispose its renderer or lose its graphics context; disposing a mount-owned runtime SHALL fully release that runtime.

#### Scenario: Strict development effect replay
- **WHEN** component effects are mounted, cleaned up and mounted again
- **THEN** exactly one live registration remains per component and subsequent frames and events are not duplicated

#### Scenario: Pending setup and replacement
- **WHEN** a mount is disposed while setup is pending and a replacement mount starts
- **THEN** the retired mount cannot start a loop, reattach handlers or dispose the replacement's resources

#### Scenario: Explicit final teardown
- **WHEN** an application-owned component mount is disposed twice
- **THEN** runtime work stops and each owned control, scene resource, renderer and canvas is released once without later callbacks

### Requirement: Run entries and reusable exports are separate

A component application SHALL provide a run entry and a side-effect-free public component entry. Importing the public entry at build time SHALL NOT mount an application, create a renderer or start a session. Source aliases SHALL bundle dependencies into the consuming application with one shared graphics/component runtime, not runtime module sharing.

#### Scenario: Hello Cube imported by another application
- **WHEN** a consumer imports Hello Cube components through a source alias
- **THEN** the consumer renders them inside its own SDK runtime without executing Hello Cube's run entry or creating another renderer

### Requirement: Hello Cube retains its app contract

The component-based Hello Cube SHALL be visually and functionally identical to its vanilla baseline, retaining its scene, animation, controls, selection and diagnostics. It SHALL retain relative asset URLs, its icon entry and established build output. This re-architecture SHALL NOT change any app's visible UI or behavior. Existing vanilla apps, template and UI Kit SHALL work unchanged without adopting the component API.

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
- **WHEN** an existing vanilla SDK application or unchanged template/UI Kit consumer is built
- **THEN** it does not require React adoption and retains its existing frame, hand, camera and disposal behavior
