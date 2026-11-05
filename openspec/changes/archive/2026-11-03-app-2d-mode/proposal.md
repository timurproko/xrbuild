# Proposal

## Why

Camera projection is currently a workspace-global build policy hidden on the Settings page. In practice the developer
chooses whether the selected app should look 2D or 3D while launching it, and that choice must be immediate: a desktop
or local browser preview needs an orthographic/perspective camera switch, while a station display already has a live
2D/3D output switch. Rebuilding apps or restarting a dev server to change that choice is too indirect.

## What Changes

- Remove the core Camera projection card and the workspace-global per-distribution camera policy. Camera projection is
  no longer part of app build context or build-receipt freshness; plugin Settings behavior stays unchanged, and the
  empty built-in Apps contribution disappears from Settings navigation.
- Replace the Project heading with shared-style **Display** and **Build** tabs above one app card. Display contains
  only Desktop/WebXR preview targets and their Run, Dev server, Fullscreen, 2D, Display and Input controls. Build
  contains distributable targets and their package identity/version/history or WebXR publisher/slug controls; its
  Build, Publish or Unpublish action shares the hero action position, and the published route appears once as
  the hero link. Each surface remembers its last platform choice independently.
- Keep the **2D** checkbox in the Display platform toolbar for Desktop and local browser previews, using Orthographic
  when checked and Perspective when unchecked. The native host keeps its station view-switch support for managed runs;
  stereo display output and immersive WebXR eye cameras remain perspective.
- Remember 2D once per project, synchronized between Desktop and standalone WebXR, and apply changes to a running managed app without rebuilding or restarting
  it. A local WebXR preview follows the same live choice through launcher-to-app, app-to-launcher and later app
  navigation in that preview window, while a directly opened published WebXR route starts Perspective and does not
  inherit the panel's local 2D state.
- Keep **Dev server**, **Fullscreen** and **2D** as shared app-level Display run options across native and standalone
  WebXR previews, while Display and Input remain platform-specific. WebXR normal runs open a
  panel-owned browser window on the selected monitor, fullscreen runs enter fullscreen there without an in-page
  confirmation button, Run shows a disabled Launching state during startup, and Stop closes the managed browser and
  optional dev server. Packaged headset tabs remain build-only and show no local Run or 2D controls.
- Add a bounded live camera-projection signal from the panel through the native host channel, plus a safe same-origin
  signal for panel browser previews. Extend the managed SDK camera so it can change projection without recreating app
  content or invalidating the app's camera reference.
- Replace launcher-specific query/script behavior with one bounded SDK launch context that carries projection and
  return intent across Desktop, station and WebXR distribution routes, and preserve the destination's current camera
  mode when its close control resumes the launcher. A launcher run from the local panel resolves
  rebuilt workspace previews, while packaged launchers retain the published catalog. The SDK owns the return control,
  and the launcher uses the SDK's standard spatial cursor; direct publication URLs still default to Perspective.
- Use one aspect-preserving cover policy across browser previews and immersive virtual panels so resizing crops rather
  than stretching. Let developers refresh the Display inventory from the Display selector's context menu, automatically
  replacing a disconnected saved monitor with an available one instead of retaining a Missing monitor option.
- Make the SDK return control a compact half-size standard round button with button sounds and a dark cross-page fade
  instead of a navigation flash, without intercepting the shared cursor. Let the native host follow each navigated
  page's favicon as well as its title.
- Remove the template/workspace Vite camera-policy plumbing; distribution providers do not need custom camera,
  cursor, resize or return-navigation code.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dev-control-panel`: replace global camera policy with project run-mode controls and separate preview from build
  workflows.
- `web-host`: relay the initial and live managed-camera projection independently from physical display view switching,
  and follow the active page favicon after navigation.
- `web-runtime-sdk`: support live managed-camera projection changes and aspect-preserving crop behavior for local mono,
  stereo and immersive rendering.

## Impact

- `packages/control-panel`: project detail layout, remembered run options, native run requests, preview launches,
  global Settings cleanup, build context/receipt behavior and focused tests.
- `native/host`: one bounded host option and channel message for managed-camera projection, with protocol tests.
- `packages/sdk`: live projection state, stable managed-camera identity, preview signaling and runtime/channel tests.
- `templates/app`, SDK documentation and tracked workspace apps: remove compile-time camera-policy wiring while keeping
  app-specific pose and orthographic framing hints.
- `.xrbuild`: remove the obsolete camera settings file and update the launcher so publications do not carry a local
  projection override.
