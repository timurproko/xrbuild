# web-runtime-sdk Specification

## Purpose
`@xr-build/sdk` is the JavaScript library that lets a three.js application render in 3D on a stereo display and react to hand input with minimal changes (`createXrb()`). It runs unchanged in an ordinary desktop browser during development.

## Requirements

### Requirement: Stereo camera rig
The SDK SHALL render a given three.js scene and camera as an off-axis stereo pair into the two halves of the canvas, using the host's eye positions and display geometry. The app's existing camera SHALL keep acting as the "head" camera for raycasting, labels and controls.

#### Scenario: Existing app adopts the rig
- **WHEN** an app replaces its single `renderer.render(scene, camera)` call with the SDK's `xrb.render(scene, camera)`
- **THEN** the app renders in 3D on the 3D display without other changes to its scene setup

#### Scenario: Head-coupled perspective
- **WHEN** the viewer moves sideways
- **THEN** content behind the panel plane shifts opposite to content in front of it, consistent with the physical panel acting as a window

### Requirement: Scene-to-panel mapping
The SDK SHALL let an app declare how its scene units map to the physical panel: a scale, plus the scene point at the panel centre. Hand positions and eye positions SHALL be converted into scene space through that mapping.

#### Scenario: App in arbitrary units
- **WHEN** an app declares that 1 metre of panel equals 7.6 scene units
- **THEN** a hand 10 cm in front of the panel centre appears 0.76 scene units in front of the declared scene centre

### Requirement: Smoothed hand input
The SDK SHALL expose tracked hands with ID, handedness, keypoints, pinch, grab and palm frame, also in scene space. Keypoints SHALL be smoothed with a velocity-adaptive filter and predicted forward to the display time; the app can tune or disable smoothing and prediction.

#### Scenario: Hand held still
- **WHEN** a hand is held still in front of the display
- **THEN** the rendered fingertip jitter is below 3 mm RMS

#### Scenario: Fast movement
- **WHEN** a hand moves at 1 m/s
- **THEN** the rendered fingertip lags the physical fingertip by no more than 3 cm

### Requirement: Hand lifecycle events
The SDK SHALL emit events when a hand appears or disappears and when a pinch or grab starts or ends, for every input provider, deriving pinch and grab from the keypoints when the provider does not supply them. A hand SHALL be reported lost only after a configurable grace period (default 400 ms) without data.

#### Scenario: Pinch start and end
- **WHEN** a tracked hand's index-thumb pinch begins and later ends
- **THEN** exactly one `pinchstart` and one `pinchend` event are emitted for that hand ID

#### Scenario: Provider without gestures
- **WHEN** the input provider declares no pinch and no grab capability and a hand pinches
- **THEN** the SDK still emits `pinchstart` and `pinchend`, computed from the keypoints

### Requirement: Contact interaction primitives
The SDK, with its UI kit, SHALL provide touch-free 3D controls driven by hand contact with box or sphere volumes: push button, toggle switch, continuous slider, stepped slider and trackball rotation, with tunable push depth, angle tolerance, hysteresis, cooldown and damping.

#### Scenario: Button press
- **WHEN** a fingertip enters a button volume and pushes past the configured push depth along the button's inward axis
- **THEN** the button fires one click, and fires no further clicks until the fingertip retracts and the cooldown elapses

#### Scenario: Trackball spin
- **WHEN** a hand moves across a trackball volume and then leaves
- **THEN** the object rotates in the direction of motion and keeps coasting with exponential damping

### Requirement: Pointer emulation for existing apps
The SDK SHALL be able to translate a hand into standard DOM pointer events on the app's canvas: a projected fingertip position for move, and pinch or push for down/up, so apps built on pointer or raycaster input work without changes to their input handling.

#### Scenario: Click on a 3D marker
- **WHEN** pointer emulation is enabled and the user pinches while their fingertip projects onto a clickable mesh
- **THEN** the app receives `pointerdown`/`pointerup`/`click` at that mesh's canvas position, as if a mouse had clicked it

### Requirement: Browser development mode
When no host is present, the SDK SHALL run in an ordinary browser: it renders mono or simulated side-by-side output, emulates head position with the mouse, and emulates hands from the mouse or keyboard or from a recorded hand stream.

#### Scenario: Developer runs the dev server
- **WHEN** an app using the SDK is opened at a local dev-server URL in a desktop browser
- **THEN** it renders and is fully interactive using mouse-emulated hands, with no native components installed

### Requirement: App configuration access
The SDK SHALL give the app the name of the platform provider it runs under and the parameters the station configured it with (`xrb.platform`), and SHALL notify the app when the station configures it again (`xrb.onPlatform`). Standalone and in a browser the name is empty.

#### Scenario: Read a configured value
- **WHEN** the app reads its configuration after startup under a station platform
- **THEN** it receives the parameters the station sent for this app

#### Scenario: Reconfigured while running
- **WHEN** the station sends new parameters while the app runs
- **THEN** the app's `onPlatform` listeners are called with the new parameters

### Requirement: Overlay guidance for DOM content
The SDK SHALL provide a way to show 2D panels (text, info cards) in 3D as textured planes at a chosen depth rendered for both eyes, because DOM elements outside the canvas are seen by one eye only in side-by-side mode.

#### Scenario: Info panel in stereo
- **WHEN** an app shows an info card through the SDK's panel facility
- **THEN** the card is visible to both eyes at the configured depth

### Requirement: Page performance reporting
The SDK SHALL report the page's performance to the host once per second over the host channel: frames per second, median frame time, camera-to-page hand latency (median over the last second) and render resolution per eye. The host SHALL also accept a heartbeat that carries only fps.

#### Scenario: Running in the host
- **WHEN** an SDK app runs in the host
- **THEN** the host receives a performance report every second with fps, frame time, hand latency and resolution

#### Scenario: Older page
- **WHEN** a page built with an earlier SDK sends the fps-only heartbeat
- **THEN** the host reads the fps and reports the other values as unknown

### Requirement: App icon view
Every SDK app SHALL answer the icon view: opened with `?xrb-icon=<size>` it shows only its icon subject on a transparent square of that size, navigable with `interactive` in the query. An app with a 3D icon SHALL show that object, centred and fitted, through an orthographic camera looking straight at it. The SDK SHALL provide the icon request, a ready signal (`iconReady()`), PNG captures for an embedding page, and pause/resume on its request.

#### Scenario: SDK app without icon code
- **WHEN** an SDK app with no icon code is opened in the icon studio
- **THEN** its scene shows live on a transparent square, and Take saves it as the icon: in icon mode `xrb.render()` draws a square frame without the scene background, fog and hands, and `xrb.viewSize()` is that square

#### Scenario: App with a 3D icon
- **WHEN** globe passes its `createIcon` to `createXrb()` and is opened with `?xrb-icon=512`
- **THEN** the view shows only the globe object, filling the square with a small margin, drawn orthographically on a transparent background, and the unattended render saves that frame

#### Scenario: Automatic ready signal
- **WHEN** an app built on `createXrb()` runs in icon mode
- **THEN** the SDK sends the ready signal after a short delay, unless the app opted out and sends it itself

#### Scenario: App frames its own icon
- **WHEN** an app answers the studio with its own capture function
- **THEN** the studio gets that capture; when several are registered, the last one on the page wins

#### Scenario: Pause from the studio
- **WHEN** the embedding page requests a pause
- **THEN** the app's animation frames are held until the page requests resume, and a capture during the pause draws its own frame and returns the paused view

#### Scenario: Unattended render
- **WHEN** the host renders the icon of an app that supports it (`--render-icon=`)
- **THEN** the app signals ready once its icon frame is complete, and the host saves a transparent PNG

#### Scenario: Capture from the studio
- **WHEN** the app runs in an iframe with `?xrb-icon=512&interactive` and the embedding page requests a capture
- **THEN** the app answers with a 512 x 512 PNG of the frame as currently shown, with transparency kept

### Requirement: View switch
The SDK SHALL follow the host's view: on a switch between 2D and 3D the canvas and cameras change between one view and two eyes side by side without app code, the live view is readable (`xrb.stereo`) and apps can subscribe (`xrb.onView`). An app can ask with `xrb.setStereo()`: a switchable host performs and confirms it, otherwise the SDK switches at once.

#### Scenario: Host switches
- **WHEN** the control panel switches a running app to 2D
- **THEN** the app's next frames are drawn as one view at the eye size, its view listeners are called once with 2D, and the hands and pointer keep working

#### Scenario: App switches
- **WHEN** an app calls `xrb.setStereo(true)` inside a host with a switchable session
- **THEN** the host switches and the app sees the 3D view once the host confirmed it

### Requirement: No stats overlay in apps
The SDK SHALL NOT draw any performance or diagnostics overlay in the app; no key, URL parameter or default turns one on. Performance is shown in the developer control panel instead.

#### Scenario: F2 in an app
- **WHEN** the user presses F2 in a running SDK app, or opens it with `?stats=1`
- **THEN** nothing is drawn over the app

### Requirement: WebXR headset runtime
When the page runs without a host and the browser offers an immersive WebXR session, the SDK SHALL let the app enter
the session from a user gesture (a default Enter button or `xrb.enterXR()`), render the app's scene for both eyes
through the WebXR renderer with the same `xrb.render(scene, camera)` call, and keep the desktop single-view fallback
when no session is offered. Passthrough SHALL be used when supported unless the app chooses otherwise.

#### Scenario: Same app on a headset
- **WHEN** an app built for a 3D display is opened in a headset browser engine with WebXR and the user presses Enter
- **THEN** the app's scene is shown in the headset in stereo without changes to the app's scene code

#### Scenario: Desktop browser without WebXR
- **WHEN** the same build is opened in a desktop browser that offers no immersive session
- **THEN** no Enter button is shown and the app renders one view as before

#### Scenario: Installed immersive app
- **WHEN** the page is opened with `?xrb-xr=enter` (an installed headset app's start address) or the browser grants a session after a navigation (`sessiongranted`)
- **THEN** the SDK enters the session without the user pressing Enter

### Requirement: Headset hands
In a WebXR session the SDK SHALL read the headset's tracked hand joints every frame, map them to the 21-keypoint hand
in the panel frame, and feed them to the same hand input, lifecycle events and interaction core as host hands,
deriving pinch and grab from the keypoints.

#### Scenario: Pinch on a headset
- **WHEN** a tracked hand on the headset pinches and releases
- **THEN** exactly one `pinchstart` and one `pinchend` are emitted for that hand

#### Scenario: ui-kit button pressed by a headset hand
- **WHEN** an index fingertip pushes a ui-kit button past its push depth in a headset session
- **THEN** the button fires one click, as it does on a 3D display

### Requirement: Virtual panel
In a WebXR session the SDK SHALL anchor a virtual panel in the room in front of the user at session start, with a
default size the app can override, and SHALL re-anchor it on `xrb.recenter()`. Scene-to-panel mapping and hand
positions SHALL use that panel's frame exactly as they use a physical panel's.

#### Scenario: Mapping kept
- **WHEN** an app declares that 1 metre of panel equals 7.6 scene units and runs in a headset session
- **THEN** a hand 10 cm in front of the virtual panel centre appears 0.76 scene units in front of the declared scene centre

#### Scenario: Recenter
- **WHEN** the user turns to face another wall and the app calls `xrb.recenter()`
- **THEN** the virtual panel and the app's content are placed in front of the user's new heading

### Requirement: 3D app icon
An app MAY define its icon as a 3D object: `src/icon.js` default-exports `createIcon()` returning a three.js object,
and the app's build emits it as `icon.js` next to `index.html`, an ES module whose chunks load relative to it. A page that imports it
from the app's route SHALL get the object to show in 3D. The app's icon view SHALL draw that object, so the PNG icon
is a render of the same object.

#### Scenario: Launcher shows the icon in 3D
- **WHEN** a launcher imports hello-cube's `icon.js` from its route and adds `createIcon()`'s object to its scene
- **THEN** the card shows hello-cube's sphere as a lit 3D object that turns with the view

#### Scenario: App without a 3D icon
- **WHEN** an app has no `icon.js`
- **THEN** importing it fails, and the consumer shows the app's PNG icon instead

### Requirement: Return to a launcher
An app opened by a launcher with `?xrb-return=<launcher page>` SHALL show the launcher's close control over it: `createXrb()` (or `loadReturnOverlay()`) SHALL load `return-overlay.js` next to the launcher page, once, and only when the launcher page has the app's origin. A launcher without one, or an app opened directly, SHALL show none.

#### Scenario: Opened from a launcher
- **WHEN** a launcher at `/preview/launcher/` opens globe with `?xrb-return=/preview/launcher/`
- **THEN** globe loads `/preview/launcher/return-overlay.js` and its close control returns to the launcher

#### Scenario: Another site
- **WHEN** an app is opened with an `xrb-return` on another origin
- **THEN** it loads no script from there and shows no close control

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

### Requirement: Return-only Escape navigation
The SDK SHALL handle Escape only to return an app with a validated launcher return destination. A direct app or Launcher SHALL remain open regardless of fullscreen state. Repeated keydown and disposed listeners SHALL NOT trigger additional actions. Browser-managed fullscreen behavior remains outside the SDK guarantee.

#### Scenario: Direct fullscreen launch
- **WHEN** Escape is pressed in a directly launched fullscreen app
- **THEN** the SDK neither requests session closure nor exits fullscreen

#### Scenario: Launcher child
- **WHEN** Escape is pressed in an app with a valid launcher return destination
- **THEN** it returns to Launcher once, in either fullscreen or windowed mode
