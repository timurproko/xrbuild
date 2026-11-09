# Capture UI: remembered cameras, real profiles and automatic calibration

## Everyday capture

Open **http://127.0.0.1:5190/hand-tracking/** → **Capture**.

1. Choose a connected physical camera. Identical depth cameras are distinguished by SDK serial.
2. If that camera has multiple supported capture paths, choose **RGB** or **RGB + Depth**. The Mode field is omitted when there is no choice.
3. Choose **Resolution · FPS**. The RGB + Depth menu shows the SDK's actual intersection of RGB8 and Z16 modes, not an artificial image resize.
4. For Fusion, press **Add camera** and select a different Camera 2. A and B are ordered roles, never guessed from enumeration order.
5. Leave **Track hands** checked for neural hands; uncheck for RGB/depth inspection. Processor and expert thresholds remain in Settings.
6. Press **Start capture** explicitly. Stop before changing camera, profile or hand-model settings. Source/backend changes also release owned capture.

The Capture order is **Camera → Mode (only when more than one mode is available) → Resolution · FPS**. Opening the camera selector merges browser RGB devices with SDK-enumerated camera serials, so identical connected devices remain distinct. Known virtual/depth-only browser endpoints are omitted. Right-click a camera selector for **Refresh cameras**; the command enumerates only and never starts capture. In RGB + Depth, **Add camera** reveals Camera 2 with **Remove camera** directly below it. Selecting it enters Fusion.

Your last live mode, single-camera serial/profile and ordered A/B serial/profile choices are saved in this browser's local storage. Reload, reconnect, refresh and Stop preserve those choices. This preference is origin-specific; another port/browser/profile is separate. Missing remembered devices/modes stay visibly selected as **unavailable**, with Start blocked and a reason. The viewer never silently swaps cameras or substitutes another resolution. Storage denial/corruption leaves the tab usable, but cross-reload memory may be unavailable.

Only validated preferences are stored: **no media, poses, credentials, timing or Start permission**. Camera/mode/profile choices are stored separately from integrity-checked successful spatial calibrations. Restoring either never starts capture/models. Local service tokens are re-paired automatically by the normal viewer; a developer override still requires its transient credentials after reload.

## Resolution / frame-rate contract

Supported choices are matched RGB8 + Z16 at the same width, height and FPS, bounded to **1280×720 / 90 Hz / 8 MiB per complete packet**. Both tested D435s advertise 19 choices, including 424×240, 640×360, 640×480, 848×480 and 1280×720, with FPS depending on the mode (6/15/30/60 on some, not all). Color-only 1920×1080 or asymmetric color/depth profiles are not offered by this slice.

The exact request reaches the SDK; unexpected fallback/calibration/frame shapes fail closed. Native pixels are not resized to pretend another profile. Color, native depth and aligned depth planes retain their true dimensions, intrinsics and bit depth. Pixel workers/canvases/cursors, marker corners, normalized landmark mapping, RGB-D v2 recordings and paired replay use those dimensions. Header version 1 and old baseline files remain supported: frames with no `profile` field mean the legacy `640x480@30`; other profiles carry the canonical `WIDTHxHEIGHT@FPS` field and exact plane-size checks.

Calibration/timing is profile-bound. **Changing resolution/FPS requires recalibration/requalification**, not reuse of old intrinsics or transforms. Unsupported/nonzero distortion is still rejected for metric reconstruction; selecting a mode does not waive geometry qualification. 640×480/30 remains a conservative default, not a requirement.

Higher resolution/FPS can reduce processed/model rate and increase USB/CPU/transfer load. Advertised FPS is not a guarantee of delivered inference/render rate. Per-source skips remain visible; no media queue grows to catch up. Shared recording limits stay **20 s / 600 total paired frames / 128 MiB**, not enlarged or doubled. A high-resolution clip may therefore be shorter.

## Guided calibration

After selecting Camera 2, the primary action is **Calibrate** until a qualified calibration exists for the exact ordered serial/profile pair. A modal contains both previews and just **Close / Start calibration → Done**. No ID, size, uncertainty or placement controls. Opening is camera-free; Start explicitly begins owned marker-only capture. Show one flat tag36h11 target to both fixed cameras, handheld or tabletop. Collection and fitting are automatic; natural target movement does not reset good observations.

**Done validates, applies and stores registration, then returns capture to the stopped state.** The primary action changes to **Start capture**. Right-click either Fusion camera selector for **Calibrate cameras…**. Starting later runs both hand models in Fused, using current-run SDK System Time diagnostic matching. Both sources contribute to the same A-optical 3D world; a valid B joint remains when A loses it, and vice versa. Neither valid means no point. Matched-frame status exposes both/A-only/B-only counts; the viewport explicitly labels timing unverified. No temporal uncertainty or exposure synchronization is invented. Stop/Start reuses this exact automatic rig with fresh run bindings; source/profile changes invalidate approval. **Close cancels** the pending result and restores only previously active capture. See [target preparation, timing policy and integrity](marker-calibration.md).

Measured common-event timing remains available for the advanced same-input benchmark, not an extra requirement in the simple live calibration flow. Imported/manual setups still require explicit rig confirmation; imports/reload never start cameras or confer acceptance.

## Verification and limits

241 Hand Tracking Input tests cover preference integrity/denial, exact profile intersection/bounds, shape/plane/intrinsics rejection, dynamic cursor/pixels/metric math, lossless 1280×720 recording round trip and manifest identity, moving-marker relative-pose checks, diagnostic clock provenance and real registered A/B loss/recovery, plus existing ownership/fusion/recording behavior. Native CTests, strict live check and build pass; full typecheck retains the two inherited SDK errors.

Generated development/production browser fixtures use real pixel and model workers: the minimal modal, moving-marker completion, explicit known 100 mm B→A baseline, Done→Fused with actual both-source contributions, A loss/B-only, B loss/A-only, both loss/recovery, fresh-run Stop/Start, export/import, reload restoring exact choices but no credentials/rig/capture, missing-device refusal and cleanup; zero exceptions. Earlier exact 424×240/1280×720 profile, recording and model/fusion regressions remain covered.

Scalar-only native probes separately acquired 20 packets on **each real camera** at 424×240/30, 848×480/60 and 1280×720/30, checking requested vs active profiles, exact RGB/Z16 sizes, actual SDK intrinsics and zero-coefficient geometry. No hardware media/hand poses were saved; no foreign capture was stopped. These are brief per-camera functional checks, **not sustained dual-camera/USB throughput, physical target calibration, hand accuracy or fusion acceptance**. Evidence is ignored under `.artifacts/stage6/ux-*` and `*-capture-ui-*`. Stage 6 operator acceptance still blocks Stage 7–9; Stage 10 remains unauthorized.
