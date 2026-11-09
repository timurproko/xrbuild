# Stage 5 — one-camera comparative bench

Stage 5 software is implemented for RGB v1 and RGB-D v2 recordings. It measures repeatable observations, stability and heuristic plausibility, **not anatomical accuracy**. Physical ruler/hand usefulness, real-camera benchmark acceptance, USB/station soak, CEF, generic SDK typing and model-weight redistribution remain separate unverified gates. No smoothing, fitting, prediction, fusion, panel calibration or application publishing was added. Optional proprietary reference imports remain unavailable without supplied data, rights and exact alignment.

## Run

Reuse the viewer at `http://127.0.0.1:5190/`, or start it:

Use the normal panel's `/hand-tracking/` tool after explicit bundled setup. Optional model/device dependencies must be
configured separately; default generated fixtures require neither.

Opening/importing/replaying never starts a camera, model or recording. Recording is the separate explicit Record action after camera Start. With permission from everyone visible and no sensitive surroundings, retain short stationary-open-hand, slow/fast-wave, volume-edge, palm-rotation/curl, crossing-hand and partial/full-occlusion clips. Record placement, light and gesture in annotation notes; do not call these independent reference measurements. See [RGB retention](recording-format.md) and [RGB-D precision/limits](depth-recording.md). Automated tests retained only labeled public/generated fixtures, never hardware footage.

## Compare identical input

1. Record or import one clip, then Replay. A is the original captured observation stream; RGB-D A reconstructs every saved frame sequentially with recorded sampling and a fresh history. No live pre-recording state is restored.
2. RGB v1: choose Re-run model, set processor/thresholds in Settings, then Run comparison. B is a separate completed fresh VIDEO-model cache. RGB-D: choose Re-run model for a fresh B model over the original RGB8; otherwise B uses captured observations. B depth radius/coverage/spread apply on the same saved packets/calibration in a fresh sequential reconstruction. Other B thresholds retain the first saved sampling configuration. Actual model delegate/fallback/settings/provenance are preserved, not the current edited controls. Imported asset filenames are never fetched or executed.
3. Both formats preserve timestamp gaps and process frame zero through the end, one frame at a time. Seeking does not create a different model history. Cancel/source change/delete fences stale work; partial model/reconstruction caches never replace a previous completed comparison.
4. Choose Raw vs processed or A vs B side-by-side. The synchronized 2D overlays use the same decoded RGB/frame index. The 3D panes have separate scenes/cameras and shared orbit input; labels state hand-relative versus color-camera metric. Camera-space points are not recentered/scaled for display. Raw hands retain their explicitly labeled relative inspection layout. Only same-camera depth A/B may use the existing single-viewport overlay. Frame seek/step/speed and keyboard timeline seeking stay synchronized. Mirror is display-only.

## Annotate and inspect metrics

In Record → Benchmark:

- Enter inclusive **zero-based start/end frame indices**, or use Start here / End here on a displayed frame.
- Choose Known visible / Known occluded and expected hand count 1 or 2. Stationary is valid only with Known visible. Add a short note. Add interval; intervals must not overlap. Remove/clear explicitly. Unannotated frames stay unknown, never guessed from the detector.
- For two-hand tests, acceptance means the annotated expected **set/count**, not guaranteed identity of particular physical hands. IDs are diagnostic spatial associations and may change at crossing/loss.
- Apply maximum hold/gap (default 100 ms), minimum valid points per accepted hand (15/21), and stationary landmark (default wrist). These options are exported with their denominators. Disabled model/unqualified geometry remains unavailable, not an inferred lost hand.
- Open Metrics (Stats) for the A/B dashboard, detailed interruptions/reacquisition/stationary statistics and timing summaries. The timeline has A/B state bands and a displayed-frame marker; click or use arrow/Home/End keys to seek. Green/red/blue/grey/purple states also have text equivalents.

### Definitions

| Metric | Meaning / denominator |
| --- | --- |
| Tracked-frame fraction | Accepted frames / evaluable annotated visible frames; expected hand count and valid-point threshold explicit. Annotated and unavailable frame counts are separate. Null without eligible frames. |
| Time-weighted availability | Accepted software-observation time / annotated visible time. Each observation is held at most maximum hold/gap; excess gap time and unavailable-pipeline time are reported separately. Conservative coverage estimate, not a sensor/exposure measurement. Null with no evaluable visible-time coverage. |
| Observed availability | Accepted time / covered evaluable visible time. Do not omit the separate unknown-time counters when comparing it. |
| Losses/minute | Observed tracked→lost transitions within the same visible interval and maximum gap / annotated visible minutes. An unknown gap or annotation boundary cannot manufacture a transition. |
| Interruptions | Tracked→lost to next accepted observation. Interval ends, unavailable streams and source gaps right-censor the episode. Longest interruption includes lower bounds; initial missing time is separate acquisition, not a false loss transition. |
| Reacquisition | First annotated visible time after an adjacent matching expected-count occluded interval → first accepted observation. No observed recovery is right-censored at interval end. Initial acquisition is separate; complete means exclude censored episodes from the displayed mean. |
| Stationary variability | Population per-axis SD and RMS displacement around the mean, in metres (UI mm), for the selected joint, per interval and diagnostic track ID, at least two valid points. Samples/missing frames explicit; never pool IDs or assume motion compensation. Includes residual real motion. Relative wrist statistics cannot prove camera placement accuracy. |
| Segment variation | Mean, population variance (m²), SD (m) and coefficient of variation of actual valid endpoint distances, per track/segment. Not anatomical bone ground truth. Invalid/missing endpoints are excluded, never filled. |
| Constraint events | Overlong observed segment samples versus the exported threshold; separate per-joint reconstruction long-bone/motion/palm-band rejection counts and joint-slot denominator. Anatomical angle truth is unavailable, not fabricated; no kinematic fitting was added. |
| Accuracy | Null without independently measured references. Never substitute depth acceptance, consistency, a model pose or a proprietary tracker for ground truth. |

### Timing

Reports retain counts, mean, population SD, min/max and lower-order-statistic median/p95 (`floor((N−1)×p)`), in ms. Pixel/inference/reconstruction/ready-to-processed durations keep their own clock meanings. Fresh B inference times are separate from captured timings.

New RGB-D recordings can save the first actual main-render submission timestamp of an admitted packet on the comparable page clock. No timestamp is manufactured before Record or for a packet that never reached that render. Receive-to-render includes software processing/queueing, **not exposure or physical presentation**. Older clips/RGB v1 retain unknown historical render timing. Bridge/native offset and uncertainty summaries remain estimates; source frame domains/counters are preserved. Sensor-to-host and capture-to-photon stay null; filtering is disabled. Capture, processed-result and display rates must not be conflated.

## Reports and annotation portability

- Export benchmark writes `xrbuild-hand-benchmark` v1 / implementation `one-camera-bench-1`: exact logical clip identity/content SHA-256, selected hardware/model/runtime/configuration (including recorded per-frame sampling and actual B settings), annotations/options, scalar metrics/timeline/source counters, qualified component times and limitations. No pixels, raw poses, model binaries, URLs or credentials are included.
- Content identity hashes canonical metadata (object keys sorted, array order and signed zero preserved), including per-frame media checksums. It survives a supported export/import round trip and changes if original observations/timing change. It is a corruption/identity aid, not authenticity or calibration evidence. Changing B/annotations changes the exported experiment configuration, not the immutable original clip identity.
- Export intervals writes `xrbuild-bench-annotations` v1, bounded to 64 KiB / at most 128 intervals. Long notes may need shortening to fit. Import intervals validates version, exact clip content, bounds, overlap, fields/options and stationary semantics before atomic adoption. A stale/malformed/foreign file leaves current labels unchanged. Labels use text, not HTML.
- One clip/completed comparison/label set stays in tab memory only. Annotation export/import/report download is explicit; nothing uploads or automatically persists. Before-unload warnings for unexported clip/edited annotations are best effort. A download attempt is not proof a file was saved: verify it on disk. Delete exported files manually when evaluation ends; Delete from memory is not secure erasure. Keep all media/reports private and outside public/source/cloud-synced folders.

## Verification boundary

Synthetic unit fixtures establish denominators, gap/censoring rules, per-track variability/variance, null/unavailable cases, format/hash/annotation validation, fresh-model history, ownership and cancellation. Development/production browser fixtures exercise real CPU/GPU workers, 2D/3D views, annotations/timeline, render telemetry and scalar exports, with RGB and earlier-stage regressions. Physical acceptance is not implied. Public setup/typecheck/fixture acceptance is described in the [diagnostic guide](README.md); historical prototype checks do not qualify physical accuracy.
