## ADDED Requirements

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

## MODIFIED Requirements

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
