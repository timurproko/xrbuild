# Hand tools source

The product page is core **Hands**, `/hands/`. This package is no longer a standalone app or laboratory page.
Its `hands-recordings` component contributes existing recording readers/playback to Hands without cameras or models.
There is no generated viewer, fixture mode, benchmark, comparison dashboard or model re-run workflow.

## Retained code boundaries

- `browser.mjs` / `src/live/recording/archive.ts`: list/import/export and basic replay of pose CSV, RGB, RGB-D and paired files. Original coordinate, timing and source metadata stay intact. Paired files expose independent streams, not fusion or A/B analysis.
- `src/live/multiview/calibration.ts`, `automatic-calibration.ts`, `marker.ts`, `panel.ts` and injected `viewer.ts`: manual/marker camera-to-camera measurement, validation and scalar formats, mounted by the independent `/calibration/` module through `calibration-tools.mjs`. `calibration.html` remains a scriptless legacy fragment, not a page or a Hands asset.
- `src/live/multiview/fusion.ts` and related geometry/timing, plus browser landmark acquisition/estimators: retained **unwired** as the starting point for a future two-camera provider. No product page imports their boot path, and this change does not build that provider.
- Native bridge/device/profile/marker code remains an explicit optional calibration prerequisite. Importing recording tools never starts it, invokes inference, downloads assets or compiles native code.
- The ordinary native Synthetic provider remains a provider, not a local preview or fallback. Its own provider correctness tests are independent of the removed generated browser fixture feature/tests/targets.

The camera calibration output is `xrbuild-spatial-calibration` v1: B-to-A rigid mapping in camera A optical metres,
bound to both serials and exact calibration/profile hashes. It does not modify app hand placement, qualify timing or
establish physical accuracy. See [calibration](camera-calibration.md) and [markers](marker-calibration.md) for the
measurement/format background; the independent [Calibration module](../../../../../docs/calibration.md) owns their product UI, not Hands.

## Writable data and compatibility

Preferences and saved scalar calibration remain `config/plugins/input-hands/preferences.json`, including
`handtracking.fusion-calibrations.v1`. The current storage uses bounded same-origin requests, revision checks and
exclusive writer locking. Invalid, changed, foreign or linked state is never silently reset or followed.

CSV files remain `.xrb/hand-tracking/recordings/` in the selected workspace. Explicit raw RGB/depth/paired exports
stay wherever saved. No automatic import, migration, move or delete occurs. Models/configuration remain under
`config/plugins/input-hands/`; native/tool caches stay in user `build/hand-tracking/` or checked generic caches.
No user file is a public source or package payload.

[RGB format](recording-format.md) and [RGB-D format](depth-recording.md) remain readable. Basic replay decodes
saved images/observations; it does not open a camera, re-run a model, reconstruct a hand surface or fuse cameras.
New provider-session recording is a separate raw HANDS v2 format with a frozen portable profile, wired by the
live-session task. Until that producer exists Hands says recording needs a live session. See core `docs/hands.md`.

## Explicit setup and rights

The public browser runtime and marker detector retain their pinned descriptors/notices. Optional vision/marker/native
setup is explicit and user-owned. No model weights are fetched or redistributed. Existing user-supplied models
remain private; recording playback does not load them. Native calibration needs separately provisioned reviewed device
SDK/runtime inputs; none are downloaded or started by navigation. Physical calibration/device acceptance is separate.

The package now builds a recording **library**, not HTML. Core embedded commands install/build/test fresh writable
snapshots rather than writing installed product sources. Tests cover formats, calibration mathematics, ownership,
resource bounds and retained future-provider algorithms with software data; they do not run hardware or prove accuracy.
