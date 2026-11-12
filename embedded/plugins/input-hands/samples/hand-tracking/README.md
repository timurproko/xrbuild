# Hand diagnostic

Plugin-owned implementation/sample for generated hands, browser RGB observations, optional native depth acquisition, calibration, reconstruction, bounded recording/replay, benchmarks and two-view fusion. The native application's `hand-tracking` provider remains synthetic: camera/model poses are not application input. Measured surfaces are not anatomical joint centres; physical accuracy/fusion improvement is not established by fixture tests.

## Normal use

Use the normal panel → **Hands**, route `/hands/` (`/hand-tracking/` remains an alias), after explicit public dependency/build setup. The checked browser view opens independently of optional Node/native bridge startup; bridge dependencies are loaded only on authenticated explicit requests. If the browser build itself is unavailable, the normal shared shell shows inline explicit setup/recovery instead of a centered Retry wall. The default is a generated fixture. Opening/navigation never starts camera capture, inference, model downloads or native compilation. Capture and recording remain separate explicit actions. Imported samples are independent editable copies; do not modify the installed original.

The view reuses the actual panel theme/navigation. Capture controls select runtime-reported cameras, exact supported profiles and modes. No device is silently substituted if the selected one is missing/busy. Stop/source switch/page disposal releases owned tracks/workers/processes; one authenticated tab owns each capture service. Tokens stay only in server/page memory, never URLs or preferences.

For direct development select `XRB_CORE` and `XRB_HOME`, install the frozen embedded workspace, then run this package's `dev` script. No credentials/private clone are needed. Core embedded build/test orchestration runs from writable snapshots rather than installing or producing output in this source folder.

## Assets and rights

- The exact Apache-2.0 browser runtime is pinned in package/lock metadata and `assets/vision-assets.json`; notices are retained. `assets` is an **explicit** setup command that verifies installed runtime bytes and creates a fresh asset store in core `third_party/hand-tracking`. Ordinary dev/build/tool startup does not download assets or reset an existing store.
- Marker detector source is pinned by version/public archive SHA-256 and BSD-2-Clause notice. Only explicit optional bridge build preparation fetches it into core `third_party/hand-tracking/markers`; changed/partial existing generations are preserved and refused.
- **No model weights are fetched or distributed.** Optional inference requires a separately licensed user-supplied `hand_landmarker.task` in selected workspace `config/plugins/input-hands/`. The format/size/hash descriptor verifies the expected model but does not establish redistribution rights. The local dev server serves it only locally; static builds never embed it.
- Optional device acquisition needs a separately reviewed pinned SDK/source inventory in core third_party. No private prebuilt executable/library or private dependency fallback ships here. See [bridge setup](bridge/README.md).

If optional assets are absent, generated fixtures and camera-free arithmetic/format/lifecycle tests remain available. Missing/invalid configured data is reported, not silently replaced. Real inference/device/distribution acceptance is separate from these tests.

## Writable data

User preferences and scalar calibration records live in `config/plugins/input-hands/preferences.json`, bound to this plugin. Filesystem writes use same-origin loopback requests, bounded validated data, a revision and an exclusive writer lock. Invalid, foreign, linked, changed or busy state is not overwritten. Browser visual/session state is not a source default, and capture/tokens/rig confirmation are never restored as a running session.

Explicit CSV recordings live in `.xrb/hand-tracking/recordings/` in the selected user workspace. No automatic recording/import/move occurs. Raw image/depth containers stay in tab memory until explicit user export; keep exports private and outside source/public folders. Configured native/tool/typecheck/build caches live under user `build/hand-tracking` or generic origin-qualified native caches. No recording/model/calibration is part of the public package closure.

## Checks and algorithms

The package `test` runs full strict TypeScript followed by Node fixtures. `build` uses Vite in the writable embedded generation. The focused plugin native build runs synthetic CTest, not cameras. Optional SDK geometry checks are opt-in and reported separately. No test downloads a model or executes inference just by loading the suite.

Fixtures cover finite 21-joint generation, lifecycle/cancellation, camera-API mocks, bounded single-flight workers, observations/ID association, immutable raw data, packet framing, depth units/geometry, calibration/provenance, timing/clock uncertainty, association/fusion guards, bounded record/replay/compression, same-input comparisons, scalar exports, UI contracts and isolated user storage. These establish software behaviour, not physical calibration or sensor performance.

Further guides: [recording format](recording-format.md), [depth recording](depth-recording.md), [reconstruction](reconstruction.md), [calibration](camera-calibration.md), [marker workflow](marker-calibration.md), [fusion](fusion.md), [benchmark](benchmark.md). Their workflows require explicit optional setup; previous local/private prototype evidence is not public-product or physical-device acceptance.
