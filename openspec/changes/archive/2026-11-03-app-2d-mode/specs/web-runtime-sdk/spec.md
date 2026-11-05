# Spec Delta

## MODIFIED Requirements

### Requirement: Managed app camera runtime

The SDK SHALL provide a shared app runtime that owns Xrb integration, stable managed-camera construction, resize
handling and the animation loop. The managed camera SHALL default to Perspective and SHALL be able to change live
between Perspective and Orthographic from a host projection message or a bounded panel loopback-preview signal. A
panel preview SHALL retain a random route/token/panel scope and poll the read-only loopback projection state so live
changes work across dedicated browser profiles and launcher navigation. The runtime SHALL let the app inject scene and
UI objects plus setup and per-frame behavior. The app MAY configure its own
camera pose, clipping range, perspective field of view and orthographic framing size. A projection change SHALL retain
the same public camera object, app content and runtime resources.

#### Scenario: App injects content
- **WHEN** an app creates the managed runtime and adds its objects in the setup hook
- **THEN** the runtime renders those objects with its managed camera and drives the frame hook in browser, host and immersive modes

#### Scenario: Perspective default
- **WHEN** an app starts outside a host and outside a panel loopback preview
- **THEN** the runtime creates a Perspective managed camera without requiring a build policy

#### Scenario: Orthographic policy
- **WHEN** the initial host or panel preview mode selects Orthographic
- **THEN** the runtime uses an orthographic managed projection whose bounds follow the display aspect and the app's framing size

#### Scenario: Launcher preserves active projection
- **WHEN** a launcher navigates to another managed app from any distribution route with a bounded Perspective or Orthographic launch context
- **THEN** the destination starts with that mono projection and a connected host's retained projection remains authoritative when available

#### Scenario: Live host projection
- **WHEN** a connected host changes the managed-camera projection from Perspective to Orthographic
- **THEN** the running app updates the same camera object's projection and framing without rerunning app setup

#### Scenario: Live panel preview projection
- **WHEN** an app is open under the panel's loopback `/preview/` route with a valid preview route, token and panel origin and the panel changes that run's projection
- **THEN** its managed camera observes the bounded loopback state and changes live, while state or a signal for another preview run is ignored

#### Scenario: Launcher navigation retains preview control scope
- **WHEN** a loopback launcher preview navigates to one managed app, resumes, and navigates to another managed app
- **THEN** every page retains the launcher's bounded preview route, token and panel origin so the same live projection state continues to apply across the navigation chain

#### Scenario: App-specific framing
- **WHEN** two apps use different camera poses or orthographic framing sizes under the same local 2D mode
- **THEN** both use the selected projection type while retaining their own content framing

#### Scenario: Camera consumers retain their reference
- **WHEN** app code or controls retain `app.camera` before two projection changes
- **THEN** the retained object is still the active managed camera with the original pose and clipping range

#### Scenario: Direct public route ignores local controls
- **WHEN** the app is opened directly from a publication route without a bounded launcher context
- **THEN** panel preview signals and standalone projection query parameters do not override its Perspective default

#### Scenario: Runtime disposed
- **WHEN** the app disposes the managed runtime
- **THEN** its animation loop, resize listener, preview signal, immersive session and host channel resources are released

### Requirement: Return to a launcher

An app opened by a launcher with a bounded launch context SHALL show an SDK-owned spatial close control over the app
and return to the context's HTTP(S) launcher URL when activated. The resumed launcher SHALL receive the effective
Perspective/Orthographic mode currently rendered by the destination, including a live change made after launch, and
SHALL not show a nested return control. The control SHALL be bundled with the destination app, attach to its existing
scene and interaction runtime without opening another host connection, and SHALL NOT load
executable code from the launcher origin. It SHALL use the same host view and hand interaction across Desktop, station
and WebXR distributions, match the standard UI-kit round-button treatment, and leave pointer events on the shared
canvas so the SDK cursor remains visible while hovering it. An app opened directly without a valid return context SHALL
show no close control. The close control SHALL be half the standard round button's diameter/depth, play the standard
press/release feedback sounds, and cover the destination with a dark fade before navigation. A resumed managed
launcher SHALL keep a matching cover until its first rendered frame and fade it away, avoiding a cross-page flash.

#### Scenario: Opened from a launcher
- **WHEN** a launcher opens an app with its page as the bounded return target
- **THEN** the SDK-owned close control returns to that launcher without importing a launcher script

#### Scenario: Return preserves current projection
- **WHEN** the destination is currently Orthographic or Perspective and the developer activates its close control
- **THEN** the launcher resumes in that same projection on local preview, native and published routes

#### Scenario: Live destination change is returned
- **WHEN** the destination changes projection after launch and then closes
- **THEN** the return URL carries the new effective projection rather than the launcher's stale initial value

#### Scenario: Another site
- **WHEN** the bounded HTTP(S) return target is on another site
- **THEN** the bundled close control may navigate there but loads no executable overlay code from that site

#### Scenario: Native launcher opens a published app
- **WHEN** the native `app.local` launcher opens an HTTP(S) publication on another origin
- **THEN** the published app can show the same SDK-owned return control and return to `app.local`

#### Scenario: Shared pointer and sound feedback
- **WHEN** the mouse or hand interacts with the launcher return control
- **THEN** the standard SDK cursor remains visible, the compact UI-kit-style cap shows hover or press feedback, and activation plays press/release sounds

#### Scenario: Smooth return transition
- **WHEN** the developer activates the launcher return control
- **THEN** the destination fades to the shared dark surface before navigation and the resumed launcher's first rendered frame fades in without a bright or intermediate-page flash

#### Scenario: Direct app
- **WHEN** an app is opened without a valid HTTP(S) return target
- **THEN** it shows no launcher close control and executes no remote overlay module

## ADDED Requirements

### Requirement: Uniform display framing

The SDK SHALL preserve the configured display aspect across normal browser, native display and immersive headset
rendering. Browser canvases SHALL cover the available viewport and crop centred excess rather than stretching. An
immersive virtual panel SHALL crop scene geometry at the same four physical panel edges. Resize handling SHALL update
the managed camera and pointer mapping against that stable frame without distribution-specific app code.

#### Scenario: Browser viewport has another aspect
- **WHEN** a browser viewport is narrower or wider than the configured display
- **THEN** the canvas covers it at the display aspect, centred excess is cropped, and scene geometry is not stretched

#### Scenario: Browser resizes
- **WHEN** the browser viewport changes size
- **THEN** the cover frame, managed-camera bounds and pointer coordinates update together without recreating app content

#### Scenario: Immersive headset frame
- **WHEN** the same app enters an immersive headset session
- **THEN** perspective eye cameras render only content inside the virtual panel edges instead of revealing or stretching additional content

## MODIFIED Requirements

### Requirement: Orthographic mono and perspective stereo

The SDK SHALL accept the live projection of a managed app camera. In a mono browser or 2D host view it SHALL render
the camera Orthographically when 2D is selected and with Perspective when 3D is selected. In a stereo host view it
SHALL render the physical eyes with off-axis perspective cameras, and in an immersive session it SHALL render with the
browser/headset perspective camera, regardless of managed mono projection. Hand mapping, interaction updates, pointer
behavior, view switching and performance reporting SHALL continue in every case.

#### Scenario: Browser on a 2D monitor
- **WHEN** Orthographic is selected for a managed app in a normal panel browser preview without an immersive session
- **THEN** the scene is drawn through the orthographic managed camera as one view

#### Scenario: Host in 2D
- **WHEN** Orthographic is selected for a managed app in a host reporting a 2D view
- **THEN** the host canvas is drawn through the orthographic managed camera without app-specific render branching

#### Scenario: Desktop switches to 2D
- **WHEN** a running Desktop host changes its managed projection to Orthographic
- **THEN** the next mono frame is drawn Orthographically without changing canvas size, app content, hands or pointer behavior

#### Scenario: Same app switches to 3D
- **WHEN** that running host switches from 2D to stereo
- **THEN** the next frame uses off-axis perspective eye cameras while preserving the managed camera's pose, panel mapping and clipping range

#### Scenario: Immersive session
- **WHEN** a locally Orthographic preview enters an immersive WebXR session
- **THEN** the headset renders through its perspective eye projections and the app's hands and interactions continue to update

#### Scenario: Return to mono
- **WHEN** the app leaves immersive mode or the host switches back to 2D
- **THEN** the runtime resumes the current managed mono projection without recreating app content

#### Scenario: Repeated live changes
- **WHEN** the panel alternates 2D and 3D repeatedly while a managed app runs
- **THEN** projection matrices, resize bounds, picking and rendering follow every confirmed value without recreating app content
