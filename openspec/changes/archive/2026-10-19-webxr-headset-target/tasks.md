# Tasks

A check on a real headset needs the headset packager, which is a workspace plugin planned in the workspace; it is
that change's first task (default virtual panel size and pose, hand signal defaults, frame rate). The tasks here are
verified by unit tests on stubbed WebXR objects, the template in the host, and the panel on a scratch workspace.

## 1. SDK: WebXR backend

- [x] 1.1 Backend selection in `Xrb` (host, then WebXR, then desktop; design D1) with `xr` options (mode, button, panel, passthroughBackground); verify with `node --test` cases using a stubbed `navigator.xr` for no WebXR, passthrough offered, VR only, an app-chosen mode and a refused query
- [x] 1.2 Session lifecycle: Enter button, `enterXR()` / `exitXR()`, `setAnimationLoop`, render through the SDK's XR camera, view stereo and not switchable in a session and mono after it, passthrough background (D2); verify with `node --test` cases on a stubbed renderer and session
- [x] 1.3 Joint mapping 25 -> 21 keypoints and per-frame push into `HandInput` with 0 ms prediction (D3); verify with `node --test` cases for the mapping table, stable ids per input source, a hand with a missing joint left out, and one `pinchstart` / `pinchend` from joint frames
- [x] 1.4 Virtual panel anchor, its `DisplayInfo`, `recenter()` and reference space reset, the rig from reference space to the scene (D4); verify with `node --test` cases for the 7.6 units per metre scenario (rig and hand input path), recenter in front of a new heading, and the head landing at the panel-frame eye position
- [x] 1.5 Template app uses `xrb.setAnimationLoop`, and the SDK warns once when a session shows nothing; verify the template builds against this SDK and renders at 60 fps in `xrb-host` (desktop display, `--status=stdout`)

## 2. Packager contract

- [x] 2.1 `Packager.target` in `packagers.ts` (D5): host by default, `webxr` build options without runtime and plugins, an unknown target refused at discovery; verify with `node --test` cases for discovery of both targets, the platform lists per target, and the options a `webxr` fixture packager receives

## 3. Control panel

- [x] 3.1 Manifest `target` read and written under the existing settings rules; verify with `node --test` cases: absent means host, an unknown value is a field error, a save writes `webxr`, the changed-on-disk refusal still applies
- [x] 3.2 Settings Target selector, Platform list filtered by target, Display, Input and the host's run controls hidden, "Open in browser" (D6); verify in the panel on a scratch workspace with a `webxr` fixture packager: the headset project shows Open in browser, Target, Platform and the packager's field; switching to Host brings Display and Input back and marks packaging unavailable
- [x] 3.3 Package build for `webxr` projects skips the host checks and passes the D5 options, and a WebXR headset app is refused by Run; verify with `node --test` cases with no host built, and Build package in the panel writing to `builds/` and raising the version

## 4. Docs and checks

- [x] 4.1 SDK README (WebXR headsets section, minimal app on `setAnimationLoop`) and `.claude/CLAUDE.md` describe the two targets and the virtual panel in neutral words; verify `pnpm check:names` and the README test pass
- [x] 4.2 Run `pnpm test` and `pnpm check:names`; verify both pass
