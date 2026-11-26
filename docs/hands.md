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

## Recording integration

The page exports `handsPage` from `ui/hands.js`: `view`, `snapshot`, `request`, and `recorder`.
`snapshot` is the editor's revision-bound base, not the running session's profile authority. While `view.active`
the session component owns ordered SDK profile updates; saved-file polling changes only idle preview.
`view.profile` returns a cloned validated applied profile. Start must reject `recorder.replaying` (including async
replay setup). Never derive recording provenance from unsaved controls or acknowledge a profile merely reaching disk.

The live-session component calls `handsPage.recorder.connect({ producer, format })`:

- `producer.recordingSource()` returns the selected source/session/epoch and validated portable profile snapshot, or null when idle.
- `producer.subscribeRawFrames(listener)` returns an unsubscribe function; events contain owned raw native packets, source sequence and capture/publication times, before SDK adjustments/filtering.
- `producer.subscribeLifecycle(listener)` retires/finalizes the current recording on Stop/failure/epoch change.
- `format.validate(document)` validates the agreed raw format and every native packet. `format.replay(document, { view })` explicitly plays it through a fresh view epoch and returns a disposer.

The agreed format is `kind: xrbuild-hand-session`, version 1, raw `panel-metres`,
`processing: provider-published`, `globalAdjustmentsApplied: false`, axes `x-right,y-up,z-viewer`,
clock `windows-qpc-ms`, source/session/epoch provenance and a frozen portable `profile`.
`samples` contain original sequence/capture/publication times and base64 unchanged native HANDS v2 packets.
Caps are 16 MiB encoded, 10,000 samples and 120 seconds; gaps stay gaps. Recording stops visibly on a cap or session retirement.
New captures remain in memory with explicit Export (`.xrbhands`). Navigation warnings persist after download
initiation, which cannot prove durability; replacing that buffer requires confirmation. Imported files already exist on disk.
No control claims to record before the compatible producer/validator arrives in the live-session change.

Replay uses the recorded profile once, not the current live profile plus the recorded profile.
The replay view wraps `setProfile` and `beginSession` with `mode: replay`; current-profile polling leaves that snapshot alone.
Stopping replay restores the current saved profile. Live and replay cannot concurrently feed the view.
Legacy CSV/RGB/RGB-D/paired files use their unchanged readers and original spaces, not the provider-stream schema.

The optional `hands-recordings` export is a contained checked component, not a second page.
Its exact asset allowlist serves only legacy reader helpers through `/hands/tools/`; bounded same-origin
storage operations use `/api/hands/tools/`. No device/model/inference/fusion module is started by loading it.

## Data

Global source and adjustments belong to workspace `config/hands/profile.json`.
Legacy pose CSV remains in `.xrb/hand-tracking/recordings/`; optional calibration/preferences remain in
`config/plugins/input-hands/preferences.json`. Exports and models stay in their existing locations.
The page redesign does not migrate, delete or rewrite user data. Replay preserves a recording's coordinate space
and provenance; old camera-relative data is not silently promoted to provider input or adjusted twice.
