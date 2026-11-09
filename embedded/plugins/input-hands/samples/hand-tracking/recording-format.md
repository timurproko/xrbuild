# Local recording/replay — CSV poses, RGB v1 and RGB-D v2

## User recording library — CSV pose v1

The visible **Record** tab writes hand-tracking poses as CSV files under the selected user workspace's `.xrb/hand-tracking/recordings/`. Recording remains an explicit action and never starts with capture, navigation or reload. The single button changes from **Record** to **Stop recording**; the live indicator reports elapsed time and current CSV size. Completed files are listed with seek, rewind, play/pause, stop and delete controls, plus an explicit local-folder action.

CSV rows preserve `time_ms`, coordinate `space`, hand ID, reported handedness, landmark index, XYZ and validity. RGB uses immutable MediaPipe hand-relative landmarks; RGB-D and Fusion use their current camera-metric reconstructed/output landmarks; recording does not upgrade calibration or timing qualification. Invalid metric landmarks stay invalid and are not filled, smoothed or anatomically corrected. CSV playback renders the stored pose only; it does not recreate camera imagery, depth, timing qualification or application input.

The development server bounds each write to 16 MiB, validates IDs, stores no file outside the recording folder and performs folder opening only after the explicit button action. The visible recorder defaults to 120 seconds and exposes a persisted 1–120 second automatic-stop limit in Settings. **Start recording** is an explicit action that, by default, starts the currently configured capture source when needed, waits for it to run, and then begins CSV recording; stopping the recording leaves capture running. The persisted **Start capture automatically** setting can disable this shortcut so recording requires capture to be started manually first. Deleting a listed recording deletes its CSV file; this is not guaranteed secure erasure by the filesystem.

The lossless diagnostic containers below remain implemented internally for benchmark and reconstruction work but are hidden from the simplified product recorder.

Stage 2.5 established RGB v1; the first Stage 5 slice adds [RGB-D v2 and depth A/B](depth-recording.md). Both remain private local evaluation only. Implemented in `src/live/recording/`. This is a diagnostic media/observation format, **not** native host `.hands` replay, calibrated application input, or a sensor-raw archive.

## Consent, storage and retention

- Camera Start and **Record RGB** / **Record RGB-D** are separate explicit actions. Clicking Record is the recording authorization/boundary; the redundant scene-consent checkbox was removed at the operator's request. Obtain permission from everyone visible and exclude sensitive surroundings. No recording starts on page load, import, replay, camera restart or a previous recording's completion.
- The recording admits only processed input frames acquired **after** recording Start. A bitmap already in inference at Start is omitted and counted using an in-flight admission fence, even when a rounded browser clock gives it the same timestamp as Start. Stop admits no new callbacks; an already admitted PNG encode may finish before the clip becomes ready.
- One clip lives in this tab's memory. No IndexedDB, localStorage, automatic file write or image upload. Closing, refreshing, hot-reloading or disposing the page loses it. A before-unload warning is best effort, not durable storage.
- Export is a user-requested browser download. Verify the file in Downloads before deleting the in-memory copy; browser policy, save cancellation or a failed download cannot be detected as successful file storage by this UI. One temporary export URL is retained for at most 30 seconds, or until replacement/delete/dispose.
- **Delete from memory** releases the application's clip/cache references, preview and URLs and cancels import/rerun. Late results are discarded; a single uncancellable browser PNG encode/decode may settle before its references are released. This is not secure erasure of browser/OS memory.
- Delete does **not** remove downloaded files. Keep exports local, outside source/public folders and cloud-synced storage; delete them through the file manager when evaluation finishes. Source ignore rules are not an access-control boundary. Never publish personal recordings, calibration, model payloads or user configuration.

## What is recorded

Each retained frame pairs an unmirrored, unannotated PNG with that same inference input's original immutable `LiveFrame`: raw normalized/world landmark arrays, handedness categories, associated diagnostic observations/IDs and original timing fields. Empty/no-hand results are valid frames, not missing RGB or invented poses. No added smoothing, extrapolation, joint confidence or camera/panel transform is introduced.

PNG is lossless **8-bit browser-decoded sRGB RGB/RGBA**, not original camera YUV/Bayer data, a JPEG/video re-encode, or depth. Recording snapshots the worker-returned input bitmap synchronously before the live session closes it, using a separate canvas. Display mirroring and landmark painting never enter the saved image. Tests verify opaque RGBA pixel equality across encode/decode, including immediate closure of the borrowed input bitmap. Browser camera color conversion has already happened before this recording boundary.

The manifest preserves actual per-run thresholds, requested delegate, actual CPU/GPU delegate and fallback reason, runtime version/npm integrity, model ID/file/hash, loader/WASM filenames/hashes, browser source ID/label, actual dimensions and reported frame rate (or `null`), page time origin, UTC start/stop labels and preview mirroring. Editing the current UI while a camera runs does not rewrite its recorded settings. Browser source IDs are local-origin identifiers, not physical serials. Intrinsics, depth scale, native frame numbers, camera-to-panel calibration and device capture timestamps are unavailable, not guessed.

## Bounded capture and drop accounting

The first reached limit stops recording: **20 seconds, 600 frames, or 128 MiB encoded container budget**. Maximum image size is 921,600 pixels and 4 MiB per PNG. Each JSON block is capped at 128 KiB; capture reserves that much for the manifest/header. These bound encoded data, not total browser process memory: model/WASM, JS object overhead and one in-flight image require additional memory.

Only one encoder is in flight; there is no pending-frame queue. The clip is a subset of the live inference input sequence, **not** a lossless continuous camera stream. It may stop earlier for large/noisy images. The original timing gaps remain; replay does not interpolate them.

Manifest `drops`:

| Field | Meaning |
| --- | --- |
| `sourceBusy` | Difference in live session's software busy-arrival counter over the recording window. These are scheduler arrivals skipped while inference is busy, **not** measured physical sensor frame losses. The live scheduler may sample the same decoded camera image more than once. |
| `encoderBusy` | Processed results omitted while the single recorder encoder/hash operation is outstanding. |
| `beforeStart` | Already-in-flight inputs acquired before the recording consent/start boundary. No such pixels are retained. |
| `invalid` | Rejected nonfinite/incomplete/unbounded geometry or mixed source/profile; includes an encoding failure. No NaN is silently serialized as zero/null. |
| `limit` | A candidate omitted because its encoded size would exceed the budget. |

`stopReason`, frame indices and original frame-ready/media times expose completion/limit reasons and gaps. These counters do not reconstruct unknown hardware frame numbers or guarantee native camera timing. An encoder error finalizes any previous good frames as a partial clip; a zero-frame recording is not exportable. Delete before recording/importing another clip prevents silent overwrite.

## Binary layout

Filename: `.handtracking`. All lengths are unsigned **32-bit little-endian** bytes; JSON is UTF-8. No archive entries, external image URLs, model binaries or directory paths are executed/resolved from an import.

```text
8 bytes  ASCII XRBHTRK1
4 bytes  manifest JSON length
N bytes  manifest JSON
repeat manifest.frameCount times:
  4 bytes  frame metadata JSON length
  4 bytes  PNG length
  M bytes  frame metadata JSON
  P bytes  PNG
EOF (trailing bytes rejected)
```

Manifest schema: `format: "xrbuild-hand-tracking"`, `version: 1`, identity/start/stop/reason, capture metadata above, `frameCount`, `durationMs`, drops, and these explicit declarations:

```json
{
  "streams": [{"kind":"rgb","encoding":"png-rgba8-srgb","width":640,"height":480}],
  "calibration":"unavailable",
  "topology":"mediapipe-21",
  "runningMode":"VIDEO",
  "maxHands":2,
  "timebase":"relative-frame-ready-ms",
  "privateEvaluationOnly":true
}
```

Frame metadata: `{ index, relativeMs, pngSha256, observation }`. Indices are contiguous recording indices, not native frame numbers. `relativeMs = observation.timing.frameReadyPageMs - firstSavedFrameReadyPageMs`; the first is zero and later times are strictly increasing. Duration equals the final frame's relative time, not the button-to-button wall interval. Original page/worker/media clocks stay in `observation.timing`; they are not relabeled as the replay page's clock. JSON numbers round-trip finite numeric values, including numeric `-0`; invalid/nonfinite geometry is rejected explicitly.

Import reads bounded Blob slices progressively, validates schema/version, declarations, dimensions, hand counts/topology, coordinate frames, finite values, clock provenance/order, indices, lengths and SHA-256 for each PNG. It rejects truncation, inconsistent duration, unsupported streams and trailing bytes before adopting a clip. Header/hash checks are not a signature or an authenticity claim; full PNG codec failures are surfaced during browser decode. Untrusted labels use textContent, and imported model/asset filenames never choose the model loaded for a rerun.

Version 1 has **no depth stream** and is never used as a partial substitute for RGB-D. [Version 2](depth-recording.md) preserves the native packet's original/aligned Z16, RGB and calibration. The shared Record controls choose the actual running source's format; import detects the file magic. Delete the existing clip before recording/importing another source. Do not squeeze Z16 into 8-bit RGB or accept an unknown stream as if supported.

## Replay and estimator reruns

- **Captured** displays the exact saved observations paired with their saved RGB. Play/Pause, frame-index seek, previous/next frame and ¼×/½×/1×/2×/4× speed use an independent recording-relative clock. Index-based seek avoids fractional-millisecond rounding across frame boundaries. No interpolation or automatic loop.
- One PNG decode is in flight; only the latest requested index is retained. Superseded/late bitmaps are closed, and a corrupt frame does not spin a decode retry on every render tick. Image and overlay are updated together. Playback can skip display frames if decoding/rendering falls behind, without changing the recording or model input sequence.
- **Re-run** requires explicit **Run comparison**. It uses the installed pinned assets and a snapshot of the selected settings, with actual delegate/fallback shown. A fresh VIDEO model processes **every saved frame in order**, one at a time, with task timestamp `relativeMs + 1` ms. It preserves captured gaps, not wall processing speed. Completed raw/associated outputs are cached separately; seeking never reinitializes a model at an arbitrary frame or changes its history.
- Cancellation, source changes, import/delete and dispose fence stale work and release the worker. No partial rerun replaces the previous completed cache. Editing controls does not alter a completed cache; its actual settings remain displayed until another run finishes. Changing model/runtime from the captured provenance produces a warning; imported filenames are never fetched.
- Original capture output may reflect live tracking **before** recording Start; that pre-roll/internal model state is not saved. A fresh rerun need not reproduce the warm live graph bit-for-bit. Same saved inputs/configuration give controlled repeat runs, not a general cross-backend/driver determinism or accuracy guarantee. The exercised CPU repeat returned identical raw JSON; that is one fixture result, not a universal promise.
- Original capture timing, rerun processing timing and replay timing are distinct. Live frame-ready-to-render metrics are hidden during replay; no historical capture-to-current-render latency is fabricated. Handedness scores are not per-joint confidence. Both modes stay diagnostic and never feed SDK/native application interactions.
