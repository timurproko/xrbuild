# Proposal

## Why

XR Build apps run only inside `xrb-host`, on a 3D display with an external hand tracker. The same apps and the same
ui-kit controls should run on a standalone headset with built-in hand tracking, through its browser engine's WebXR
support, so one app and one hand UI serve both kinds of device. A project needs to say which kind of device it is
built for, and the platform's packager needs to know that a headset package carries no host.

## What Changes

- **Build target.** A project selects a target: `host` (today: `xrb-host` on a display, with display, input and
  platform providers; the default) or `webxr` (a standalone headset running the app in its browser engine through
  WebXR, no host and no providers). Stored as `target` in `xrb-project.json`.
- **WebXR runtime in the SDK.** `createXrb()` gains a WebXR backend. When the page runs without a host and the browser
  offers an immersive WebXR session, the SDK starts it on request (an "Enter" button or `xrb.enterXR()`), lets the
  WebXR renderer draw both eyes, and reads the headset's hand joints into the same `Hand` stream, events,
  interaction core and pointer emulation the host's hands feed. ui-kit controls work unchanged. Apps drive frames
  with `xrb.setAnimationLoop` (a page's own animation frames stop in a session); the app template does.
- **Virtual panel.** On a headset the SDK places a virtual panel (default size and pose, app-tunable) in the room when
  the session starts. The app's scene-to-panel mapping and the controls' physical sizes keep their meaning.
- **Packager target.** A packager declares the target it builds for (`host` by default). A `webxr` packager gets the
  built web app, icon and identity, and no host runtime or plugins. The panel lists only packagers of the project's
  target as platforms.
- **Panel.** Settings get a Target selector; for `webxr` the Display and Input selectors and the host's run controls
  are hidden and Build package uses the `webxr` packager. The first headset packager writes a local, installable
  package file to `builds/`; the developer installs or uploads it with the headset vendor's own tools.

Non-goals: the concrete headset packager (it lives in the user's workspace as a plugin, with its own toolchain and
signing), uploading to a store, a dev server over the LAN, live run status or performance from the headset, controller
input, and building apps on any vendor's own web framework.
