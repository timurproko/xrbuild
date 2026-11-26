# Hand provider and tools

Catalog ID: `input-hands`. Native provider ID, existing recording formats and user-owned paths stay stable.
The core **Hands** module lives only at `/hands/`; old diagnostic/legacy page routes are removed without redirects.
This plugin no longer registers a separate page or importable generated sample.

The native `hand-tracking` provider remains Synthetic, using the public input ABI and authored 21-joint poses.
Its unchanged authored pose is embedded in C++, independent of the removed browser JSON/generated header.
It is an ordinary installed provider, never an automatic preview/fallback. Native settings retain scenario,
hand-count and requested cadence; Stop/restart applies changes. Invalid-pose validation cases are not valid app input.
Stop joins the producer, destroy stops, and no callbacks survive teardown. No physical tracker or model is started.

## Tools and retained source

The contained `hands-recordings` export mounts compatibility playback inside core Hands. It serves only its bounded
reader dependency closure, with same-origin data operations and no inference/native capture on navigation.
Existing CSV, RGB, RGB-D and paired data keep their original coordinate/time provenance. New selected-provider
recording uses the separately delivered live session and raw versioned format, not the old camera-derived CSV producer.

The contained `camera-calibration` export mounts measurement in the independent [Calibration module](../../../docs/calibration.md)
at `/calibration/`, with explicit owned capture and a stable serial/profile-bound B-to-A camera transform. It is not a Hands tab.
Browser hand landmarks and two-view fusion algorithms remain unwired source for a future provider. No such provider
or active acquisition laboratory ships in this change. Generated browser fixtures/tests/targets and benchmark/comparison
workflows are removed from UI and code. Pure format/calibration/provider unit data is not a product fixture mode.

## Ownership and setup

- Product source/defaults: this core-owned plugin; normal use never writes it.
- Global Hands source/adjustments: selected workspace `config/hands/profile.json`.
- Calibration/preferences/models: selected workspace `config/plugins/input-hands/`.
- Existing CSV recordings: `.xrb/hand-tracking/recordings/`; exports stay wherever saved.
- Native/tool/typecheck/build caches: user `build/hand-tracking/` or checked origin/source-scoped caches.
- Public native/vision assets: core `third_party/hand-tracking/`, explicit pinned verified setup only.

Use explicit `XRB_CORE` and the selected user workspace. Nothing walks source ancestors to guess ownership, imports or
moves user files, starts a runtime or silently replaces missing/invalid state. Root embedded commands build/test
fresh frozen snapshots, not installed sources. The native build uses the generic selected-origin plan/lock/receipts.

No model weights, camera recordings, private native executables or device SDK payloads are transferred by source
approval. Optional setup/distribution rights and physical-device/calibration acceptance remain separate gates.
See [source and compatibility](samples/hand-tracking/README.md) and [native bridge](samples/hand-tracking/bridge/README.md).
