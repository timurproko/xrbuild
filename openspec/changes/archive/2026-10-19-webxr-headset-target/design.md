# Design

## Context

- The SDK gets eyes, hands, display geometry and view changes over the host channel; without a host it renders one
  view from a nominal viewer position (desktop browser fallback).
- Hands are 21 keypoints per hand in the panel frame (metres, panel centre origin, +z towards the viewer), smoothed
  and predicted by `HandInput`; pinch and grab come from the provider or from the keypoints. The interaction core and
  ui-kit consume `Hand` / `SceneHand` only.
- WebXR hand input gives 25 joints per hand (`XRHand`) as poses in a reference space, already predicted to the
  frame's display time by the runtime.
- Packagers implement the contract in `packages/control-panel/src/packagers.ts` and always ship the host runtime.

## Goals / Non-Goals

**Goals:** one app source and one ui-kit for both targets; the headset target sits behind neutral contracts (WebXR,
the packager contract) so the core names no headset or vendor; a first headset package the developer installs by hand.

**Non-Goals:** see proposal.

## Decisions

### D1. Target is a project setting, the backend is chosen at run time
`xrb-project.json` gets `target: "host" | "webxr"` (absent = `host`). The web build is the same for both; the SDK
picks its backend at run time: host present -> host channel; else an immersive WebXR session supported -> WebXR
backend; else the desktop fallback. One `dist/` therefore also previews in a desktop browser and in a WebXR emulator.
*Alternative:* a build-time define per target; rejected, it splits builds without need.

### D2. WebXR backend inside `Xrb`, not a second API
`Xrb` keeps its public surface. In WebXR it enables `renderer.xr`, drives frames with `renderer.setAnimationLoop`
(exposed as `xrb.setAnimationLoop(fn)`), and `xrb.render(scene, camera)` renders through the XR camera. Session mode is
`immersive-ar` (passthrough) when supported, else `immersive-vr`; `XrbOptions.xr.mode` overrides. Sessions start from a
user gesture: the SDK shows a small DOM Enter button unless `xr.button: false`, and `xrb.enterXR()` / `xrb.exitXR()`
exist. In a session `view.stereo` is true and `switchable` false. Pointer emulation stays on: it projects the
fingertip onto the (virtual) panel and dispatches pointer events on the canvas, which still exists during a session,
so apps built on pointer or raycaster input keep working; the interaction core drives its targets directly. In
passthrough the scene background is hidden (and the clear alpha is 0) while the frame is drawn, so the room shows
through; `xr.passthroughBackground: false` keeps it. The SDK's end-of-session handler is added after the renderer's,
so the view reported on exit is already mono.

### D3. Joint mapping into the 21-keypoint hand
`wrist -> WRIST`; thumb `metacarpal, phalanx-proximal, phalanx-distal, tip -> CMC, MCP, IP, TIP`; each finger
`phalanx-proximal, phalanx-intermediate, phalanx-distal, tip -> MCP, PIP, DIP, TIP`; finger metacarpals are dropped.
The hand id is stable per `XRInputSource`, handedness comes from the source. Joints are read once per XR frame,
transformed into the panel frame (D4) and pushed into `HandInput` as a provider without native pinch or grab (both
derived from keypoints). Prediction is 0 ms (the runtime already predicts to display time); smoothing keeps its
defaults and stays tunable.

### D4. Virtual panel
On the first frame of a session the SDK anchors a virtual panel in the `local` reference space (always available in
an immersive session; the panel is placed relative to the head, so a floor origin is not needed): centre 0.45 m in
front of the head and 0.15 m below it, facing the head, yaw only; default size the nominal display's (about
0.60 x 0.34 m). `DisplayInfo` reports it, `xr.panel` overrides size and offset, `xrb.recenter()` and the reference
space's `reset` event re-anchor it. The panel frame is then the same as on a 3D display, so `PanelMapping` ('camera'
or 'world'), hand-to-scene conversion and the controls' physical sizes are unchanged. The SDK renders through its own
XR camera whose parent maps reference space to the scene (`panel.toWorld x virtualPanel.toPanel`, scale included), so
the app's camera is never overwritten by the head pose; that camera's near and far are divided by the scale (the
headset's projections are in metres).

### D5. Packager target
`Packager.target?: 'host' | 'webxr'` (absent = `host`). For a `webxr` packager the panel passes `app`, `identity`,
`icon`, `iconColor`, `out`, `log` and `selection.platform`; `runtimeDir` is `''`, `plugins` is empty and `pluginDirs`
unset. The contract stays one interface, so existing packagers need no change. A project's Platform list shows only
packagers whose target matches it; `--list-plugins` platforms are host-only.

### D6. Panel
Settings: a Target selector (Host / WebXR headset) above Display. `webxr` hides Display and Input, lists `webxr`
packagers as Platform, hides Run on the display, 2D mode and the camera and hand views, and offers "Open in browser"
(the built `dist/` from the panel's local server) for a desktop preview. Package build works as today without the host
checks.

### D7. The headset packager stays in the workspace
The packager that wraps `dist/` as an installable headset app (its toolchain, signing key and app manifest) is a
workspace plugin, planned there. The core gets only a `webxr` test packager fixture.

## Risks / Trade-offs

- Headset hand data is noisier or smoother than a camera tracker's -> defaults are checked on device; the `hands`
  options tune them per app.
- Apps that run their own `requestAnimationFrame` loop draw nothing in a session -> the SDK warns once and the app
  template uses `xrb.setAnimationLoop`.
- No host channel, so no live status in the panel for headset runs -> accepted for the first release.
- Some packaged browser shells need the content from an https origin rather than bundled files -> the packager decides;
  the contract hands it the built folder either way.
- The panel's Built packages list reads only `.zip` packages, so a headset package shows in its job's output but
  not in that list -> a follow-up change when the headset packager's format is known.

## Open Questions

- Default virtual panel size and pose: chosen so the template's controls sit within comfortable reach; confirm on device.
