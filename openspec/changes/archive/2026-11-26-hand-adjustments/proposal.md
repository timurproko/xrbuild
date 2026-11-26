# Proposal

## Why

People need to adjust hand position, size and skeleton appearance consistently across apps without changing an acquisition plugin or adding app code. The merged hand-input abstraction already provides global Hands ownership and a single SDK ingress seam; this change delivers its planned first follow-up before live preview.

## What Changes

- Extend the existing workspace `config/hands/profile.json` with validated panel-space XYZ offsets, wrist-centred uniform size and drawing-only skeleton/indicator settings. Missing fields preserve today's exact geometry and look.
- Apply geometry once in the SDK after provider conversion and before shared filtering, gestures, interaction, pointer and drawing; preserve native gesture decisions and do not repeat provider rig correction.
- Add relocatable Position and size / Appearance sections in their own component outside the current source card, using shared panel controls, group resets and explicit Apply. A forthcoming layout can mount the same sections beside a hand view unchanged; designing that layout/live view is separate. Keep source Save next-launch-only; Apply persists adjustments and delivers them to a running managed app.
- Carry a portable validated profile on every managed native/dev/browser launch, trusted Launcher navigation, package and publication. Running geometry Apply releases held interactions and resets filters; appearance Apply only changes drawing. Packages/publications freeze their build-time profile.
- Keep standard managed hand drawing automatic and respect `handVisual: false`. No acquisition plugin/private repository changes, live viewer, camera, tracking runtime or hardware work.

## Capabilities

### New Capabilities

None; extend the existing ownership and input contracts.

### Modified Capabilities

- `hands-module`: global adjustment storage, validation/concurrency, grouped controls, reset and explicit Apply with honest delivery status.
- `hand-input`: canonical wrist-relative geometry, drawing-only appearance, launch/build snapshots and revision-safe running-app application without app code.

## Impact

- SDK: a shared pure profile contract, `hand-source.ts`, `hand-visual.ts`, runtime lifecycle in `index.ts`, and host-channel/control decoding.
- Panel: `hands-state.ts`, Hands API/UI, resolution and active-run state in `panel.ts`, checked document bootstrap/package staging and packager metadata.
- Native host: bounded neutral JSON profile control/retention on the existing authenticated channel, launch-config plumbing and tests; no change to plugin ABI, HANDS payloads or acquisition processing.
- Focused fake-provider/state/channel/browser regressions and SDK/owner documentation. Proof screenshots use an isolated panel after implementation; no product code or screenshots are delivered by this planning-only PR head.
