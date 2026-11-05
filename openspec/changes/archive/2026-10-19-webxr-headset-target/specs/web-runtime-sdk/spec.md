# Spec Delta

## ADDED Requirements

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
