# Stage 4 — depth-assisted surface reconstruction feasibility

This slice connects raw RGB landmarks to qualified depth measurements. It produces **color-camera-space surface points at model landmark locations**, not anatomical joint centers, ground-truth hands, calibrated panel input or a guaranteed improvement over the model. Raw observations remain separate and unchanged.

## Run and inspect

Reuse the task viewer at `http://127.0.0.1:5190/` if it is running. Otherwise start it:

Use the normal panel's `/hand-tracking/` tool after explicit bundled setup. The optional bridge/model dependencies need
separate verified configuration/build steps before an explicit capture Start.

Open the URL in Chrome. After an explicit verified user-cache build, the viewer pairs its owned bridge automatically; no second terminal or pasted token is needed. In **Capture**, select a native camera serial and press **Start capture**. If Settings uses the browser RGB backend, select RGB-D first. Opening/pairing the viewer does not start a camera, model or recording. Stop releases capture. Developer-managed old Stage 3 services can still supply raw inspection, but measured reconstruction requires the new helper's explicit geometry metadata; a missing descriptor gives a visible error, never an assumed transform.

- **Measured surfaces — camera metres** shows gold points/bones only where measurements pass the checks. Missing positions have no 3D sphere, bone or fallback. Physical motion changes camera-space position; hands are not independently recentered/separated.
- **Raw model — hand-relative** restores the cyan model shape in its separate original coordinate frame. It is not overlaid/registered as if camera-metric. Reset/view switching and the one-time **Frame measured points** action move the viewer camera only; stored measurements are never translated, scaled or mirrored for convenience.
- RGB keeps the original model overlay. Gold circles show accepted depth samples; red crosses show rejected samples at their 2D locations. Invalid 3D points have no invented coordinates. Inspect a landmark for rejection/support/spread and separate raw-relative versus measured-optical XYZ readouts.
- Per-hand **palm, fingertips and all-joint coverage** use denominators 5/5/21. These are processed-observation depth acceptance counts, not joint confidence, tracking accuracy or the whole image's nonzero-depth percentage. That older frame percentage remains a separate depth-view diagnostic.
- Click RGB to select a purple **static surface probe** independent of any hand/model. It always uses the aligned-to-color plane, regardless of the depth heatmap plane selected. Display mirroring is inverted before lookup. The old depth hover reports original source depth-camera Z; the new probe reports corrected color-camera XYZ.
- Optionally enter an independently measured **color optical-axis target Z**. Empty means unknown; no reference distance is filled automatically. Housing-to-target offsets, slant distance and camera placement must be accounted for by the operator. Displayed Z difference is not an independent accuracy certificate.
- The optional stationary-target window holds at most 60 processed observations, including explicit invalid entries; repeated native depth frame IDs are not counted twice. It reports valid/invalid counts and population Z standard deviation, without compensating motion. This is unfiltered surface variability, not a hand-accuracy/stability benchmark. Changing source/pixel/sampling configuration resets it.

The first Stage 5 slice now adds explicit [lossless RGB-D v2 recording/replay and depth A/B](depth-recording.md). No source media, raw hand poses, target data or presets are automatically written/uploaded. Live geometry/history/window remain in memory and clear on stop/switch/dispose; only a separately requested recording retains a bounded clip. The Stage 2.5 RGB-only recorder is never silently substituted. Local bridge/token/origin rules remain in [the bridge contract](bridge/README.md).

## Coordinate and calibration contract

Actual SDK calibration identifies color/depth/aligned profiles, intrinsics/distortion, scale and depth-to-color extrinsics. The explicitly built helper verifies its SDK header/runtime version and adds:

```json
{"geometry":{"version":1,"alignedPixelFrame":"color-optical","alignedValue":"original-depth-optical-z"}}
```

The earlier SDK source review of CPU/SSE alignment established that alignment copies source Z16 values into color-pixel footprints. Therefore **aligned pixels have color coordinates but the stored Z is still original depth-camera optical Z**, not automatically color-camera Z. Deprojecting it directly with color intrinsics would silently mix frames.

With `p_color = R * p_depth + t` (SDK column-major proper rotation, translation in metres), qualified color ray `r = [(u-cx)/fx, (v-cy)/fy, 1]`, and sampled source depth `Z_depth`, solve:

```text
p_depth = transpose(R) * (lambda*r - t)
lambda = (Z_depth + dot(R.column(2), t)) / dot(R.column(2), r)
p_color = lambda * r
```

The resulting frame is **color-camera-metric**: +X right, +Y down, +Z forward, units metres. Geometry uses unmirrored continuous RGB landmark pixels; no model-relative z enters this equation. A measurement describes a representative local depth surface along that RGB ray, with SDK registration/footprint and model-location errors still possible.

Current optics qualification is intentionally narrow: 640×480 color/aligned calibration must match, the model must be None/Inverse Brown Conrady/Brown Conrady with **all five coefficients exactly zero**, and the rotation must be finite, orthonormal and proper. Nonzero/other distortion, missing metadata, invalid scale or a mismatched aligned frame is refused explicitly, not treated as pinhole by default. Supporting more optics requires additional native SDK comparison tests. The exercised D435 color/aligned calibration satisfies this qualification.

Rendering maps `(x,y,z)` to `(x,-y,-z)` only. Auto-framing changes the view camera, not measurement origins. There is **no camera-to-panel transform** or application publishing. The native `hand-tracking` provider remains synthetic.

## Conservative sampling and rejection

`src/live/rgbd/reconstruction.ts` is independent of Three.js, the SDK and Node. It processes at most two 21-point hands, with radius at most 3 (49 pixel reads per point). Work is bounded and small; expensive image preparation/inference remain in existing workers. Sampling reads original 16-bit aligned bytes without modifying them.

Defaults (heuristic experiment settings, **not** camera calibration or confidence):

| Check | Default |
| --- | --- |
| Patch | Radius 2, up to 5×5, clipped only for an in-bounds center |
| Center | Must have nonzero depth; no hole filling from surrounding background |
| Depth range | 0.15–3 m; not a claim about the D435's qualified near range |
| Support | At least 9 available samples (or full clipped area if smaller), ≥72% in-range coverage |
| Surface spread | 10th–90th percentile spread ≤40 mm |
| Noise | Median absolute deviation ≤10 mm |
| Center versus patch | Difference ≤25 mm |
| Representative sample | Observed upper median Z16, not a synthetic averaged depth |
| Palm | At least 3 accepted samples among wrist and four MCPs (0,5,9,13,17) |
| Palm consistency | Other points within ±180 mm of current sampled palm Z |
| Bone safety | Reject child endpoints for measured segments longer than 180 mm; no fitting/length correction |
| Temporal outlier | Displacement ≤40 mm + 3 m/s × elapsed native steady time |
| History | At most 250 ms, scoped to run/config/associated ID; expiry allows reacquisition |
| Pairing | Aligned stamp must equal source depth; matching SDK System/Global Time with reported difference ≤50 ms |

Off-image model points are invalid, never clamped to the border. Zero/range/support/edge/noise/center/palm/bone/motion/clock/calibration failures keep `point:null` plus a reason. Validity means these depth-consistency heuristics passed; it does not establish the model detected the correct finger or that the visible surface is a joint center. Bone checks and motion rejection do not anatomically fit, smooth or predict a pose. Rejected points are not held/displayed from history.

The current Windows source reports SDK System Time without separate sensor exposure/readout metadata. Pair skew is a reported software-clock guard, **not verified simultaneous exposure**; every reconstruction keeps exposure synchronization unverified. Unmapped hardware clocks are refused rather than compared just because their labels match. Raw source inspection/model inference continue if reconstruction is unavailable.

## Verification and limits

- Native SDK reference vectors exercise SDK deprojection, rigid transforms and projection for 40 center/edge/fractional pixels, 0.25–3 m and identity/tilted extrinsics. TypeScript reconstruction agrees within 3 micrometres numerical difference / 0.001 pixel tolerance. These compare arithmetic/API conventions, **not physical sensor or joint accuracy**.
- Unit cases cover holes, out-of-frame points, foreground/background edges, noise, center spikes, missing/coherent palm anchors, background fingertips, long segments, jumps, history expiry/reset, duplicate/out-of-order frames, clock/calibration errors, window bounds and no invented invalid geometry.
- Browser fixtures use an explicitly labeled public hand image and generated known Z16 planes/holes. They prove matched raw/metric views and 42-point reconstruction, complete rejection on zero depth, recovery, reference-Z sign, target-window behavior, CPU/GPU/depth-only processing and cleanup. They are not real-hand depth accuracy evidence.
- Actual D435 browser checks exercise qualified live calibration/depth, corrected surface probe, offsets, optional model/depth-only paths and cleanup without saving images/raw hand poses. An empty scene establishes no physical-hand accuracy or quality improvement.

Before deciding the approach helps: measure independent flat targets at several known optical-axis distances and near image edges; hold real palms/fingertips at the intended range; inspect per-region acceptance, repeated losses and variability; compare against raw model behavior without treating it as ground truth. Report actual movement, lighting, depth holes and reference uncertainty. If depth coverage/behavior is poor, keep the raw mode and reconsider rather than loosen checks until bad measurements look good.

No full benchmark dashboard, metric application input, panel calibration, smoothing, anatomical fitting, second-camera fusion or alternative model is implemented by this slice. Those remain subsequent explicit decisions.
