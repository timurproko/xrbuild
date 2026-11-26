# Hands

`/hands/` is the core hand workspace: global skeleton provider, post-processing component slot,
SDK hand view, grouped global adjustments and Record. It opens without optional hand tools.
Source changes apply on the next app launch; viewing this page never starts hardware.
Until the separate live-session component is connected, the view is idle and Record says it needs a live hand session.

The former diagnostic and legacy hand-tracking page routes are removed (404, no redirects).
There is no generated preview, local fixture, fixture interaction target or laboratory navigation.
Synthetic remains an ordinary installed provider choice, never a fallback.

## Independent modules

Camera calibration is **not** part of Hands. A following change extracts it as the separate Calibration module.
Its output is a B-to-A camera-space rigid transform, bound to both cameras' serials and exact profiles, not an app-hand offset.
See the output contract in `openspec/changes/hands-module-page/design.md` while that extraction is pending.
Existing calibration code and state remain intact. Browser landmark and two-view fusion algorithms are retained,
unwired from product pages, as source for a future provider. No such provider is implemented here.

## Data

Global source and adjustments belong to workspace `config/hands/profile.json`.
Legacy pose CSV remains in `.xrb/hand-tracking/recordings/`; optional calibration/preferences remain in
`config/plugins/input-hands/preferences.json`. Exports and models stay in their existing locations.
The page redesign does not migrate, delete or rewrite user data. Replay preserves a recording's coordinate space
and provenance; old camera-relative data is not silently promoted to provider input or adjusted twice.
