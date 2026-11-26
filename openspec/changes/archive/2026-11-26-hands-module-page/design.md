# Design

## Context

This **latest simplified revision supersedes both earlier plans**. Hands is the sole hand-workspace page. Keep the provider, shared hand view, post-processing selector mount, global adjustments and recorder/replay in Hands. Calibration is a separate module, delivered by the immediately following PR. Remove fixture and benchmark/comparison code. Retain browser hand-landmark and two-view fusion source, unwired from every product page, as the starting point for a future two-camera provider. Old page routes are removed, never redirected.

Partial shell work from the earlier approval is uncommitted. It is not a finished implementation of this revised scope; no feature code or user data has been deleted. PR 50 remains open at the last check. The following findings are source inspection, not hardware validation.

## What calibration actually is

The old page has **camera-to-camera spatial calibration**, not hand-position calibration or a skeleton-provider correction:

- Manual path: `src/live/multiview/panel.ts` collects static target pairs through `RgbdPanel`'s native RGB-D surface probe, bound to different camera serials and exact profiles. It needs at least six fit and three held-out check pairs, fixed-camera confirmation and uncertainty evidence. `calibration.ts` fits and validates `pA = R * pB + t`, in metres, with residuals/profile hashes.
- Marker path: `automatic-calibration.ts`, `marker.ts` and the marker dialog currently embedded in `multiview/viewer.ts` consume synchronized selected RGB/depth packets and native marker observations from two cameras. Marker calibration can start **without hand-model workers**. It still needs the optional input plugin's checked native bridge, device runtime, marker detector/assets, valid intrinsics/depth and two camera profiles. It is not supplied by the new real hand-provider session.
- Manual results live in the tab until explicit export as `hand-tracking-spatial-calibration.json`. Marker Done stores up to eight validated results under `handtracking.fusion-calibrations.v1` through workspace storage, ultimately in workspace `config/plugins/input-hands/preferences.json`; the shared manual panel can also adopt/export the result. Capture choices share that preferences file. Imported results do not prove that the physical rig is unchanged.
- **Consumers today:** the old two-view viewer/fusion registers camera B into A; fusion setup export includes the result. SDK/apps/global `config/hands/profile.json` do not consume it. Removing fusion removes that runtime consumer. Keeping calibration still permits measurement, validation, save/import/export, but must not claim to calibrate the selected provider or improve app hand placement.

**Approved split:** keep all calibration sources/results intact now and document their interface; extract them in the immediately following PR as the separate **Calibration** module at `/calibration/`, with its own XR Build module-menu entry and no Hands tab. Do not add a menu entry until that complete module works. It will contain only calibration-specific camera selection, explicit Start/Stop, marker preview and manual-target fallback. Extract it from the fusion viewer; do not retain fusion merely because its class currently hosts calibration. Keep native packet/device/clock validation, marker capture, intrinsics/projection, depth-probe sampling, rigid fit/validation and persistence. Keep hand-landmark and fusion algorithms unwired for the future provider. Calibration's eventual minimal module imports only the small shared point-sampling primitives, not hand inference or fusion engines. Calibrating app-hand position remains the PR 50 Position and size controls, not this camera transform.

## What the recorder actually records

There are several existing formats; “the recorder” is not one native hand-stream recorder:

| Existing recording | What is stored/replayed | Live dependencies today |
| --- | --- | --- |
| On-disk pose CSV v1 (`recording/csv.ts`, `csv-panel.ts`) | Relative time, coordinate-space tag, hand ID/handedness, 21 XYZ joints with per-joint validity; no images, native gesture capabilities or global profile snapshot | Subscribes to browser camera landmarks (`hand-relative`), RGB-D reconstructed hand surfaces (`camera-metric`), or fusion output; it does **not** subscribe to the selected skeleton provider |
| RGB clip v1 (`format.ts`, recorder/replay) | PNG frames plus model observations, source/runtime/model hashes, clocks, relative timing and provenance; bounded tab memory, explicit import/export | Browser camera and landmark worker for new capture; recorded-observation replay needs neither a camera nor new inference |
| RGB-D clip v2 (`depth-format.ts`, depth recorder/replay) | Compressed native RGB/depth packets, exact device/profile/intrinsics calibration, timing, optional observations and sampling settings | Native RGB-D bridge; raw recording can omit hand-model observations. Recorded packets can be decoded/displayed without live hardware |
| Paired clip (`multiview/recording.ts`) | Two nested RGB-D streams, shared-page receive-time provenance, distinct camera identities | Two native streams to create new clips. Existing A/B streams can be replayed independently without fusion or benchmarks |

CSV files stay in workspace `.xrb/hand-tracking/recordings/`; preferences/calibration stay in `config/plugins/input-hands/preferences.json`; exported clips/calibration remain wherever the person saved them. Existing storage uses bounded regular-file/containment checks and explicit same-origin writes; retain those protections and existing format validation.

**Conflict and recommendation:** removing browser landmarks, hand-surface reconstruction and fusion removes **all three producers of today's pose CSV recorder**. It cannot keep recording exactly as today without retaining the very acquisition engines the person has removed. Keep existing recording list/import/export/read/seek/playback with original coordinate labels, and retain raw image/depth/paired decoding needed for old media files, but remove re-inference, comparison, benchmarks and fusion playback. For new useful recording, connect to the selected provider via the separate live-provider task. Until that seam exists, show “Recording needs a live hand session” and no pretend-working Start recording control. Do not stamp panel-space/app-adjusted frames as legacy `hand-relative` or `camera-metric`, discard native signals, or replay them through global transforms twice. The provider-stream contract is now agreed through PR 53: `xrbuild-hand-session` v1 with raw panel-metres HANDS v2 packets, source/session/epoch/sequence and QPC capture/publication clocks, plus a frozen portable profile. Replay uses that snapshot exactly once. Bounds are 16 MiB, 10,000 samples and 120 seconds; no tokens/paths/images. `handsPage.recorder.connect({producer,format})` binds raw/lifecycle observers and the live task's strict validator/replayer. New captures stay in memory until explicit Export; old formats remain unchanged. See docs/hands.md for exact callbacks and replay-profile ownership. This is an explicit dependency/behavior decision, not a claim that the old recorder already supports provider frames.

## Minimal layout

```text
XR Build · Hands                         [render fps] [hand tracking fps]

+-----------------------+  +--------------------------------+  +-----------------------+
| Skeleton provider [v] |  | [View v] [Reset] [fullscreen]    |  | POSITION AND SIZE     |
| availability / reason |  |                                |  | PR 50 fields / Reset  |
| session status        |  |       shared SDK 3D hand view  |  |                       |
| [Start/Stop mount]    |  |       honest idle until live   |  | APPEARANCE            |
| [Save source] [Reload]|  |                                |  | PR 50 fields / Reset  |
| Post-processing [mount]| |       no generated fixture     |  | [Apply]               |
|                       |  |                                |  |                       |
| RECORD                |  | replay preserves file's space  |  | compact status only   |
| selected tool content |  | and is labelled as replay      |  |                       |
+-----------------------+  +--------------------------------+  +-----------------------+
```

Only Record in the Hands tool area; no Calibration, Capture, Setup, Output, Points or Stats tab. Camera controls belong only to the following independent Calibration module. Recorder holds existing file list/import/playback; old media can display its saved images in recorder content rather than reinstating a laboratory view. Global adjustments remain together in a persistent right-side root. Reuse existing panel visual language and View/Reset/fullscreen; fps chips report actual current context, with tracking unavailable when idle. No fixture Pause/Restart; ordinary playback Play/Pause remains.

## Kept / removed / needs live provider

| Area | Classification | Boundary |
| --- | --- | --- |
| Core Hands shell, provider picker and source Save/Reload | Kept | One global source, explicit revision-safe writes, no fallback |
| Shared SDK view/profile and View/Reset/fullscreen/fps | Kept | Actual app pipeline; no raw diagnostic filtering override |
| Post-processing selector mount | Kept | Separate component owns the first hand-mesh option and runtime; no example choices/system here |
| Position, size and appearance | Kept, PR 50 dependency | Mount its delivered component after merge, never duplicate schema/transform |
| Camera-to-camera calibration | Kept for immediately following module PR | No Hands tab; separate Calibration menu entry/route, native measurement, marker/manual depth probe, fit/save/import/export; no SDK/app consumer today |
| Native RGB-D transport, marker observation, depth point sampling | Kept only as genuine calibration dependencies | Extract minimal dependency closure; no hand model or general camera/depth laboratory UI |
| Existing CSV and media/paired recording formats/storage/playback | Kept | Original coordinate/provenance semantics, no implicit migration or re-inference |
| New selected-provider recording and real-hand drawing | Needs live provider | Requires actual session frames and explicit recording provenance; not today's camera recorder |
| Generated fixture, scenarios, fixture tests/targets/counters | Removed, code included | Native Synthetic remains an ordinary provider; its unchanged authored pose lives in C++, without the deleted browser JSON/generated header dependency |
| Browser hand landmarks / inference workers | Retained source, unwired | No Hands/camera-source UI; starting point for a future provider, not active acquisition |
| General surface inspection / old standalone viewer | Removed from product UI | Geometry needed by retained calibration/future two-camera code remains; no acquisition UI in Hands |
| Two-view hand fusion algorithms | Retained source, unwired | Future provider starting point; no fusion or clock-qualification laboratory UI |
| Benchmarks, A/B analysis, annotations, model rerun and reports | Removed, code included | Not required for basic playback or calibration |
| Separate diagnostic page/name, old routes and navigation | Removed | `/hands-diagnostics*` and `/hand-tracking*` return normal 404, never redirects |

This table supersedes the prior full-feature mapping and the earlier unreachable-code plan. **Fixture and benchmark/comparison removal is real source/build/test cleanup**, not hidden modules. Browser landmarks and fusion are explicitly retained exceptions, unwired from product UI. Before deletion, compute the retained calibration/recording import closure; split mixed modules so useful helpers survive without importing removed engines. Native plugin provider registration remains independent from removed fixture UI/tests; do not delete an installed Synthetic provider simply because it is synthetic.

## Stable parallel-task seams

- `#hands-session-status`: current view/session state, separate from source availability and Previous app session.
- `#hands-session-actions`: empty initially hidden row below Source status and before Save source; live-provider mounts Start/Stop here.
- `#hands-postprocessing-root`: left-side selector mount after source actions. Initial one-sentence state: “No post-processing plugins are installed.” No hardcoded concrete processor implementation in core.
- `#hands-adjustments-root`: right-side persistent PR 50 mount, including both groups and one Apply.
- `#hands-recordings-root`: the only Hands tool root. Calibration has no Hands root or tab. Optional missing recording plugin/build produces one concise reason, not a page-wide install/retry wall. Existing file access should not require opening a device.
- `ui/hands-view.js`: `createHandsView({canvas, viewport, onMetrics, onStatus})` returns async `setProfile(profile)`, `beginSession({epoch, mode?})`, `pushFrame({epoch, sequence, frame, capturePageMs})`, `clearSession()`, `resetView()`, `setViewOptions(options)`, `dispose()`. Profile validation precedes admission; epochs/sequences fence old frames, not transport authentication. Live-provider owns authentication, clocks, exclusive lease and shutdown. `mode: replay` pins the recorded profile against current-profile polling; stopping it restores current saved settings. The view exposes `active`, `replaying`, `currentHands`, `sceneHands` and the shared `interaction` for the consuming session component, with no targets created here. Calibration-specific capture must participate in that lease before real simultaneous starts are exposed.

No production provider starts on navigation. Until live sessions land, the source notice plainly says the selected provider runs with an app and live viewing here is unavailable. Calibration capture is not called provider preview. Legacy replay is not silently normalized to app input.

## Acceptance and dependencies

1. Sole page and exact small layout; missing optional tools leave the core usable with honest reasons; no generated mode or old routes/redirects.
2. Source/adjustments preserve revision/conflict/unknown-field/draft semantics; PR 50 is mounted only after merge, otherwise report sequencing dependency.
3. Preserve calibration code/data and document the independent output contract below; no calibration menu/tab/device action in Hands. The following module PR owns extraction and fake RGB-D/marker acceptance.
4. Existing CSV/RGB/RGB-D/paired software files list/import/read/play without camera/model/runtime, retaining units/time/provenance. New Record is not advertised as working until the live-stream contract is actually delivered. Native flags/profile snapshots must not be invented for old data.
5. Fixture and benchmark/comparison source/tests/build dependencies are removed, not hidden. Calibration and future-provider landmark/fusion source are retained but have no page entry point. User files/caches are never a deletion target.
6. Run isolated panel/workspace/browser only, screenshots of Hands and Record at default window size with actual dimensions, no person's panel/profile/projects, no hardware or inference. All evidence/scratch in the task folder; stop all owned processes before reporting.

Revised size: approximately 5–8 engineer-days for the dependency extraction, compatibility playback and real code retirement plus page integration, excluding PR 50 wait and the separate live-provider/schema work. Native/physical acceptance remains explicitly outside software-only validation.

## Independent Calibration output contract

The following module PR will expose `/calibration/` and one module-menu entry labelled Calibration, with the one-line purpose: “Measures camera B relative to camera A for a future two-camera provider.” It does not build that provider.

The existing output is `xrbuild-spatial-calibration` version 1. Its frame is `camera-a-optical`, metres; mapping is `pA = rotationRowMajor * pB + translationMeters`. Bind the result to both camera serials and exact color/depth/aligned profiles, intrinsics/extrinsics, depth scale and source metadata hashes. Preserve input target/evidence hashes, held-out residual checks and qualification flags; no identity transform fallback. `temporalAlignment:null`, `fusionEnabled:false` and `physicalValidation:operator-required` do not become synchronization/accuracy guarantees. Consumers must validate format/integrity and current serial/profile bindings, reject changed rigs/profiles and obtain separate timing/physical qualification. A future provider may consume this contract but no provider/session/global profile is changed here.

Storage remains `config/plugins/input-hands/preferences.json`, key `handtracking.fusion-calibrations.v1`; manual scalar exports and existing fusion-setup wrappers remain readable. The name of that persisted key does not imply an active fusion UI. No automatic migration or calibration deletion accompanies removal of the standalone viewer.

Delivering the module in a second PR keeps capture ownership/extraction review separate from the page and recording compatibility. This PR preserves all its code/format dependencies and documents the boundary; it does not add a dead Calibration entry.

## Risks / Trade-offs

- [“Calibration” misunderstood as app alignment] -> identify exact B-to-A camera transform and absent app consumer; keep PR 50 geometry controls distinct.
- [Recorder claims unchanged behavior after its producers are removed] -> keep old data readable, explicitly bind new writes to live-provider delivery and agree schema before enabling them.
- [Deleting mixed modules breaks calibration or old data] -> import-closure audit, extract primitive helpers first, then remove engines/tests/build references and run focused compatibility checks.
- [Live task and calibration both open cameras] -> shared acquisition lease required before concurrent starts; no implicit app termination or fallback.

## Migration Plan

No data migration. Replace the UI and component wiring, preserve existing paths/format readers, remove only obsolete source/build/test paths. New provider recordings must use a deliberately versioned stream contract; never rewrite old recordings to approximate it. Rollback restores code/UI without changing user data.
