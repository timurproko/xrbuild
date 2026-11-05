# Spec Delta

## ADDED Requirements

### Requirement: Managed app camera runtime

The SDK SHALL provide a shared app runtime that owns Xrb integration, camera construction, resize handling and the
animation loop. It SHALL choose Perspective or Orthographic from the supplied build policy, defaulting to Perspective,
and SHALL let the app inject scene and UI objects plus setup and per-frame behavior. The app MAY configure its own
camera pose, clipping range, perspective field of view and orthographic framing size, but SHALL NOT need to construct
or replace the managed camera to follow the global projection policy.

#### Scenario: App injects content

- **WHEN** an app creates the managed runtime and adds its objects in the setup hook
- **THEN** the runtime renders those objects with its managed camera and drives the frame hook in browser, host and immersive modes

#### Scenario: Perspective default

- **WHEN** no valid camera build policy is supplied
- **THEN** the runtime creates a perspective camera and preserves the existing SDK rendering behavior

#### Scenario: Orthographic policy

- **WHEN** the build policy selects Orthographic
- **THEN** the runtime creates an orthographic managed camera whose bounds follow the current view aspect and the app's framing size

#### Scenario: Launcher preserves active projection

- **WHEN** a managed app is opened from a launcher carrying a valid Perspective or Orthographic launch context
- **THEN** the app uses that projection for its mono managed camera even when its compiled build policy differs, while invalid or absent launch values retain the compiled fallback

#### Scenario: App-specific framing

- **WHEN** two apps use different camera poses or orthographic framing sizes under the same distribution policy
- **THEN** both use the globally selected projection type while retaining their own content framing

#### Scenario: Runtime disposed

- **WHEN** the app disposes the managed runtime
- **THEN** its animation loop, resize listener, immersive session and host channel resources are released

### Requirement: Orthographic mono and perspective stereo

The SDK SHALL accept a managed perspective or orthographic app camera. In a mono browser or 2D host view it SHALL
render an orthographic camera directly when configured. In a stereo host view it SHALL render the physical eyes with
off-axis perspective cameras, and in an immersive session it SHALL render with the headset's perspective camera,
regardless of the mono app projection. Hand mapping, interaction updates, pointer behavior, view switching and
performance reporting SHALL continue in every case.

#### Scenario: Browser on a 2D monitor

- **WHEN** an Orthographic app runs in a normal browser without an immersive session
- **THEN** the scene is drawn through the orthographic managed camera as one view

#### Scenario: Host in 2D

- **WHEN** an Orthographic app runs in a host reporting a 2D view
- **THEN** the host canvas is drawn through the orthographic managed camera without app-specific render branching

#### Scenario: Same app switches to 3D

- **WHEN** that running host switches from 2D to stereo
- **THEN** the next frame uses off-axis perspective eye cameras while preserving the app camera's pose, panel mapping and clipping range

#### Scenario: Immersive session

- **WHEN** an Orthographic-configured app enters an immersive session
- **THEN** the headset renders through its perspective eye projections and the app's hands and interactions continue to update

#### Scenario: Return to mono

- **WHEN** the app leaves immersive mode or the host switches back to 2D
- **THEN** the runtime resumes the configured orthographic mono camera without recreating app content
