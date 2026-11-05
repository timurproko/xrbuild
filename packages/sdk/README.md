# @xr-build/sdk

three.js on 3D displays with hand input.

Inside `xrb-host` on a stereo display your page is shown in 3D: the SDK renders an off-axis
view per eye from the viewer's tracked eye positions, and hands arrive from the host's input
provider. On a 2D display, and in an ordinary browser, the same code renders one view from a
nominal viewer position, so you can develop without the rig. Displays and inputs are host
plugins (see the [main README](../../README.md#plugins)); the SDK only sees what the host channel
reports.

## Getting the SDK into an app

There is nothing to install or publish: apps (in your workspace, logically separate from the core) take the SDK and
`@xr-build/ui-kit` straight from the core's sources. The package is TypeScript source (`src/index.ts`);
Vite compiles it with your app.

- An app depends on `three` (>= 0.160) and `vite` only, never on `@xr-build/sdk` or `@xr-build/ui-kit`.
- The control panel sets `XRB_CORE` (the core repo it runs from) for every build and dev server it starts.
- The app's `vite.config.js` maps the two names to the core and keeps one three.js. "New project" in the
  panel creates this from `templates/app`:

```js
// vite.config.js
import path from 'node:path';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

const core = process.env.XRB_CORE;
if (!core) throw new Error('XRB_CORE is not set: run this app from the XR Build panel, or set XRB_CORE to the XR Build core repo');
const sdk = (pkg) => path.join(core, 'packages', pkg, 'src', 'index.ts');

export default defineConfig({
  base: './',  // the host serves the build from https://app.local/ (and later from a package)
  resolve: { alias: { '@xr-build/sdk': sdk('sdk'), '@xr-build/ui-kit': sdk('ui-kit') }, dedupe: ['three'] },
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), core] } },
});
```

- **Plain terminal:** set `XRB_CORE` yourself, then build as usual. Without it the build stops with the
  message above.
- **Editors:** the panel writes `jsconfig.json` (ignored) in the workspace with the same mapping, so imports
  and types resolve.

## Minimal app

```ts
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createXrbApp, rendererOptions } from '@xr-build/sdk';

const renderer = new THREE.WebGLRenderer(rendererOptions()); // no MSAA in 3D mode
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const app = createXrbApp(renderer, {
  scene,
  camera: { position: [0, 0, 6], near: 0.05, far: 100 },
  autoStart: false,
});
scene.add(app.xrb.handsObject);                                // optional hand skeleton
new OrbitControls(app.camera, renderer.domElement);           // works with pinch-drag too
app.setFrame(() => { /* update app objects here */ });
app.start();                                                   // runtime owns resize and rendering
```

The core's `templates/app` is a complete app like this one ("New project" in the panel copies it into the
workspace). Build and run one without the panel (PowerShell, from the app's folder in the workspace):

```
$env:XRB_CORE = 'D:\path\to\xr-build'
pnpm build
& "$env:XRB_CORE\native\host\build\Release\xrb-host.exe" --app-dir="$PWD\dist"
```
## Live 2D camera mode

The panel's project-level **2D** control changes a managed app between Orthographic and Perspective without rebuilding.
Desktop hosts receive the mode over the host channel; panel `/preview/` pages receive a route-keyed loopback signal.
A launcher preview carries that preview-run route through opened apps and returns, so the same 2D control stays live as
one preview window navigates between apps. `createXrbApp()` keeps one managed camera object while updating its
projection, so app-held camera references, pose,
clipping and framing remain valid. Orthographic is drawn directly in mono views; stereo displays and immersive WebXR
sessions always use perspective eye cameras for correct depth. Direct published WebXR routes default to Perspective.
A launcher uses the SDK's bounded `appLaunchUrl()` context so its destination retains mono projection and receives the
SDK-owned spatial return control without distribution-specific scripts. Closing the destination resumes the launcher
with the destination's current Perspective/Orthographic mode, including live changes made after launch. The standard
SDK cursor is shared by the launcher and managed apps. The runtime binds mouse hover/press/release automatically;
existing explicit `xrb.bindMouse()` calls are idempotent and listeners are removed on disposal.
`createXrbApp()` also mounts the standard round `xrb.cursorObject`; no template-specific cursor setup is needed.
Set `xrb: { mouse: false }` to disable mouse binding and the cursor. Panel launches carry the selected Mouse input
through `xrb-mouse=0|1`, including launcher destinations and returns. Input selection applies on the next run;
it does not hot-swap native input providers. `pointer: false` separately disables hand-to-pointer emulation, not the mouse.

Settings → Apps → Cursor selects `system`, `ring`, or `ring-dot` (default) for the next launch. The managed
`xrb-cursor` preference overrides `xrb: { cursor: ... }` and survives launcher navigation. System hides the scene
cursor; Ring has no dot; Ring with hover dot adds its center only over an enabled interaction target. Mouse disabled
always wins. Ring modes hide the native/browser pointer in mono and stereo; disposal restores cursor styles.

Escape has one SDK owner and only returns an app with a validated launcher destination. Direct apps and Launcher
remain open in both fullscreen and windowed sessions; Escape never requests session closure. Use panel Stop or the
window's close action to quit. Repeated keydown does not trigger another action, and disposal removes the handler.
Ordinary browser tabs retain browser-controlled fullscreen behavior; scripts cannot guarantee fullscreen during navigation.

SDK navigation and UI Kit controls share one audio engine. `playUiSound`, `setUiSoundMuted`, `setUiSoundVolume`,
`UiSoundGlide`, and `uiSoundPitch` are the SDK API; the UI library retains its `play`, `setMuted`, `setVolume`, `Glide`
and `pitchOf` aliases. The return X uses the dialog-close sound alongside standard press/release feedback.

Without an explicit `camera.orthographicHeight`, the runtime matches the physical panel height in scene units, so
content on the glass plane keeps its screen size when switching projections. This works for camera-relative and
world mappings without copying another app's camera values. An explicit height remains an authored framing override.
Objects in front of or behind the glass still have the expected perspective-versus-orthographic depth differences.

Apps that call `createXrb()` directly remain compatible, but keep owning their camera and therefore do not follow live
managed projection changes until they adopt `createXrbApp()` or wire `xrb.onProjection()` to their own camera.

## What changes for an existing app

1. **Managed template (recommended)**: use `createXrbApp()` so the runtime owns projection, resize and frame rendering.
2. **Legacy render call**: replace `renderer.render(scene, camera)` with `xrb.render(scene, camera)`.
3. **Canvas size and aspect**: let `xrb.setSize()` size the canvas. Use `xrb.viewSize()`
   (one eye) for the camera aspect and for layout math. Browser canvases preserve the configured display aspect and
   cover the viewport, cropping centred excess instead of stretching; in 3D mode the canvas is two eyes wide.
4. **Picking**: compute normalized device coordinates from the canvas rectangle, as most
   three.js code already does: `(clientX - rect.left) / rect.width`. Mouse and hand events
   both follow that rule, in 2D and in 3D mode.
5. **HTML overlays**: in 3D mode DOM elements are seen by one eye only. Hide them in
   `xrb.stereo` mode or draw them in WebGL.

## How the panel maps into your scene

The physical panel is a window into the scene. By default (`mapping: { mode: 'camera' }`)
it hangs in front of your camera:

- the nominal viewer (0.6 m in front of the panel) sits exactly at the camera;
- content at `focusDistance` scene units from the camera appears on the glass,
  nearer content pops out, farther content goes into the display. The default
  focus distance is the camera's distance from the scene origin, which suits orbit-style apps.

For a fixed placement use `{ mode: 'world', center, scale, quaternion }`
(`scale` = scene units per metre).

## Hands

- `xrb.currentHands`: tracked hands for this frame, smoothed (One Euro filter) and predicted to
  display time. Keypoints are in panel metres, in the common 21-point hand landmark order (`KP.INDEX_TIP` = 8, ...).
  Each hand also has `tip`, `pinchPoint`, `pinching`, `pinchStrength` (0 open .. 1 pinched, for
  feedback before the pinch registers) and `grabbing`.
- `xrb.sceneHands`: the same hands in scene space: `points` (21 keypoints), `tip`, `pinchPoint`
  and `palm` (`position`, `quaternion` with Y = palm normal). Use these instead of converting
  keypoints yourself; `xrb.toScene(point)` converts any other panel point.
- Short tracking dropouts (< 400 ms) are bridged; a hand reported `lost` is really gone.
- `xrb.on((e) => ...)` receives `appear`, `lost`, `pinchstart`, `pinchend`, `grabstart`, `grabend`.
- Pinch = thumb-index distance below 27.5 mm for 2 tracking frames, released above 32.5 mm for
  2 frames. A provider's own pinch flag (often slower, e.g. a 3/5-frame debounce) is only used with
  `nativePinch: true` and only when the provider declares pinch.
- Grab = the provider's grab when it declares one; otherwise a fist from the keypoints: the four
  fingertips' mean distance to the palm centre below 0.45 hand lengths (wrist to middle knuckle) for
  2 frames, released above 0.55 (`fingerCurl(keypoints)` gives the value).
- Any input works the same: the host says per frame what the provider tracks natively
  (`xrb.handCapabilities`: `pinch`, `grab`, `palm`) and the SDK fills in the rest. A hand counts
  when at least half of its keypoint scores are above zero (`isValidHand`).

### Hand signal tuning

The defaults (`DEFAULT_HAND_INPUT`) are set by replaying rig recordings, not by feel:
`node test/tune.ts [file.hands ...]` in `packages/sdk` prints fingertip error at display time,
still-hand jitter, stop overshoot and pinch timing for a grid of settings, and
`test/hand-signal.test.ts` fails when the defaults miss the limits (7 mm RMS error, < 1 mm still
jitter, 5 mm overshoot, pinch within 2 frames). Record new sessions with the host's
`--record-hands=<file.hands>` (from the control panel: `"host": { "recordHands": "out/session.hands" }`
in the project's `xrb-project.json`) and add them to `test/data/`.

| `hands` option | default | |
|---|---|---|
| `smoothing` | `{ minCutoff: 1.5, beta: 40, dCutoff: 3 }` | One Euro in metres; `false` = off |
| `prediction`, `maxPredictionMs` | `true`, `50` | predict to display time |
| `predictionVelocity` | `'window'` | newest raw motion, cut on stops; `'filter'` = One Euro derivative |
| `velocityCutoffHz`, `predictionMinSpeed` | `8`, `0.05` | prediction velocity filter; no prediction below 5 cm/s, full above 10 |
| `pinchEnterM`, `pinchExitM` | `0.0275`, `0.0325` | pinch hysteresis |
| `pinchEnterFrames`, `pinchExitFrames` | `2`, `2` | tracking frames past a threshold |
| `nativePinch` | `false` | also count the provider's pinch flag (when declared) |
| `grabEnterCurl`, `grabExitCurl` | `0.45`, `0.55` | keypoint grab hysteresis, in hand lengths (provisional: the rig recordings have no fists yet) |
| `grabEnterFrames`, `grabExitFrames` | `2`, `2` | tracking frames past a threshold |
| `nativeGrab` | `true` | use the provider's grab when it declares one |
| `graceMs` | `400` | dropout bridging (a tracker may need ~200 ms to re-acquire after one empty frame) |

To get the behaviour before this tuning back:
`hands: { smoothing: { minCutoff: 1.5, beta: 4, dCutoff: 1 }, predictionVelocity: 'filter', pinchEnterFrames: 3, pinchExitFrames: 5, nativePinch: true }`.

### Hand interaction core

`xrb.interaction` is the shared arbiter every app uses instead of its own hand code. Register targets in the
frame of a scene object, with sizes in **metres of the panel** (they feel the same in any mapping or scale):

```ts
import { PokeTarget, PinchTarget, GrabTarget, VolumeTarget } from '@xr-build/sdk';
const button = xrb.interaction.add(new PokeTarget(mesh, { inside: (x, y) => Math.hypot(x, y) < 0.02, top: 0.012, travel: 0.009 }));
button.on((e) => { if (e.type === 'start') click(); });     // start | move | end, e.local in metres, e.depth for pokes
const handle = xrb.interaction.add(new PinchTarget(sliderHandle, { radius: 0.05 }));
handle.on((e) => { if (e.type === 'move') setValue(e.local.x); });
xrb.bindMouse();   // the same targets with the mouse (hover, press, drag, release)
scene.add(xrb.cursorObject);   // on a 3D display the OS pointer is not in the 3D picture: a ring shows where the mouse lands
```

- Kinds: **poke** (a fingertip pushes a surface along +z: `top` is the rest surface's local z, `travel` how far it
  goes in; press at 60 % of the travel, release below 30 %), **pinch** (a pinch starting within `radius` takes it and
  moves it until the pinch ends), **grab** (pinch or fist, follows the hand), **volume** (keypoints inside a sphere;
  engages at 6, releases at 4).
- One target per hand: the nearest qualifying target gets hover and the engage. A taken target keeps its hand until a
  deliberate release (retract, pinch end, fist open) or the hand is lost past the grace period; drifting out of the
  outline, tracking noise and short dropouts (coasting) do not release. A poke must arrive from the front.
- `target.state`: `hovering`, `proximity` (0 at the hover distance .. 1 at the surface), `cursor` (local metres of the
  hovering fingertip / pinch point), `held`, `depth`, `holder`, `mouseOver`. `target.enabled = false` drops its capture.
- Tuning: `DEFAULT_TUNING` (hover 5 cm, poke margin 1 cm, pinch / grab radius 5 cm, ...) overridden for the app with
  `createXrb(renderer, { interaction: { tuning: { pinchRadius: 0.06 } } })` or per target with `target.tuning`.
- **Pointer emulation** (on by default): the index fingertip points at the spot on the glass
  behind it from the viewer's position; pinch = button down, release = up + click, pinch and
  move = drag. Events are `pointer*` and `mouse*` with `pointerId 1`, so OrbitControls and
  mouse handlers work unchanged. Disable with `createXrb(renderer, { pointer: false })`.
- `xrb.handStatus`: the input provider's status from the host (`starting`, `running`, `needs-setup`,
  `device-missing`, `failed`; hosts before the plugin architecture said `not-calibrated` and `camera-missing`).
- `xrb.handCapabilities`: what the provider tracks natively, from its newest frame.

## Station parameters

Under a station platform (a platform plugin), the app gets the parameters the station
configured it with:

```ts
xrb.platform.name;                       // the platform plugin's name, or '' standalone and in a browser
xrb.platform.params.language;            // as the station sends them
xrb.onPlatform((p) => applySettings(p.params));   // the station can configure again while the app runs
```

## Options

| option | default | |
|---|---|---|
| `mapping` | `{ mode: 'camera' }` | panel to scene mapping |
| `resolutionScale` | `1` | per-eye render resolution multiplier |
| `pointer` | `true` | hands as pointer events |
| `hands` | | smoothing, prediction, grace, pinch and grab thresholds |
| `displayLatencyMs` | `8` | render-to-panel delay used for prediction |
| `xr` | | WebXR headset: `mode`, `button`, `passthroughBackground`, `panel` (see below) |

## WebXR headsets

The same build runs on a standalone headset with hand tracking, in its browser engine, without the host. When
the page runs without a host and the browser offers an immersive WebXR session, the SDK shows an Enter
button (`xr: { button: false }` hides it; call `xrb.enterXR()` from your own gesture instead).

- **Frames.** A page's own `requestAnimationFrame` stops in a session: drive frames with
  `xrb.setAnimationLoop(fn)`, which uses the browser's frames, or the headset's while a session runs. The SDK
  warns in the console when a session shows nothing.
- **Virtual panel.** When the session starts, a virtual panel is placed 0.45 m in front of the user and
  0.15 m below their eyes, upright and facing them (default size: the nominal display's, about
  0.60 x 0.34 m). Your `mapping` puts it into the scene exactly as it does a physical panel, so scene units
  per metre and the controls' physical sizes are unchanged. Scene geometry is clipped at the same four panel edges,
  so the headset crops like the browser frame instead of revealing or stretching extra content. `xr.panel` sets
  `widthM`, `heightM`, `distanceM` and `dropM`; `xrb.recenter()` (and the headset's own recentre) places it in front of the user again.
- **Hands.** The headset's 25 hand joints become the SDK's 21 keypoints (finger metacarpals are dropped) in the
  panel frame: `xrb.on`, `sceneHands`, the interaction core, the UI kit and pointer emulation work as on a
  3D display. Pinch and grab come from the keypoints; prediction is off (the headset predicts already).
- **Passthrough.** `immersive-ar` is used when offered, else `immersive-vr` (`xr.mode` picks one). In
  passthrough the scene background is hidden while drawing so the room shows through
  (`passthroughBackground: false` keeps it).
- **Installed apps.** An app installed as an immersive headset app has no page to tap: with `?xrb-xr=enter` in
  its address (a headset packager puts it in the app's start address) or `xr: { autoEnter: true }`, the SDK
  enters the session as soon as it is available. It also enters when the browser grants a session after a
  navigation from one (`sessiongranted`).

```ts
const xrb = createXrb(renderer, { xr: { panel: { distanceM: 0.5 } } });
xrb.onView((v) => console.log(v.stereo ? 'in the headset' : 'on the page'));
// xrb.presenting: a session runs; xrb.exitXR() ends it
```

In the control panel set the project's Target to "WebXR headset": Build package then uses a packager for
headsets (a workspace plugin), and "Open in browser" previews the build.

## Performance

The SDK draws nothing over your app. Once per second it reports the page's fps, median frame
time, camera-to-page hand latency and eye resolution to the host (`xrb.performance()` returns
the same values). The developer control panel shows them while the app runs, and the host logs
the fps every 10 s.

## App icon

Contract: every app answers the icon view. With `?xrb-icon=<size>` in the URL the app shows
only its icon subject, square, on a transparent background. That one PNG becomes the package
thumbnail and the window/taskbar icon (`icon.png`, saved by the control panel's icon studio,
`xrb-host --render-icon=<out.png>` or `app-icon render`).

Apps built on `createXrb()` follow it with no code: in icon mode `xrb.render(scene, camera)`
draws a square frame without the scene background, fog and hands, `xrb.viewSize()` is the
square (so your camera aspect is 1), the icon studio gets answered (live view, Take, pause),
and the host is told the frame is ready after `icon.readyMs` (default 1 s).

Custom framing is optional: check `xrb.icon` (or `iconRender()`) and move the camera or hide
objects. If the icon needs loading first, pass `icon: { autoReady: false }` and call
`iconReady()` yourself. An app may also answer the studio itself with `serveIconCapture()`
(the last one on the page wins).

```js
const xrb = createXrb(renderer, { icon: { autoReady: false } });
if (xrb.icon) { /* hide the UI, frame the subject */ }
// ...after the icon frame is rendered and textures are loaded:
if (xrb.icon) iconReady();
```

Pages without the SDK (plain test pages) have no live icon view; the studio offers to use a
PNG file instead.

### 3D icon

An app can define its icon as a 3D object: `src/icon.js` default-exports `createIcon()`, which returns a
three.js object (it may animate itself with `object.userData.update(seconds)`). Pass it to `createXrb()` and the
icon view draws only that object, fitted, through an orthographic camera looking straight at it, so the PNG icon
is a flat render of it. The app's build also emits it as `icon.js` next to `index.html` (a second Vite entry, see
`templates/app/vite.config.js`), so a launcher can show the same object in 3D:

```js
import createIcon from './icon.js';
const xrb = createXrb(renderer, { icon: { create: createIcon } });

// in a launcher: the fitted object, or null (show the PNG instead)
const icon = await loadAppIcon('/apps/globe/', 0.05);
if (icon) card.add(icon);
```

## Tests

```
pnpm --filter @xr-build/sdk test
```

Includes a jitter test on a hand recording from the dev rig (`test/data/*.hands`).
