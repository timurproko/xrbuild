# Calibrate → Done → combined 3D

Stage 6 diagnostic reconstruction; **not physical accuracy certification or application publishing**. Stages 7–9 wait for the operator's real fusion test and explicit approval.

## Use it

1. Open **http://127.0.0.1:5190/** → **Capture → Two cameras · fusion**. Choose different serials and supported resolutions/FPS. Choices are remembered; capture does not start on reload.
2. Keep the cameras fixed with overlapping views. Press **Calibrate cameras…**. A modal shows both previews and exactly **Close** / **Start calibration**. Opening it does not start cameras.
3. Press **Start calibration**. Show the same **tag36h11** marker to both cameras. A handheld or tabletop marker is supported. Move only the marker, not the cameras; normal marker motion or a briefly unclear frame does not erase recent valid observations. Move closer if too small/unclear. No ID, printed size, uncertainty fields or placement buttons.
4. Collection, relative-pose checks, fitting and later-frame validation run automatically. When ready the button becomes **Done**. Press it to apply registration, enable both hand-model workers and start **Fused** in one camera-A optical world frame. No separate timing form or Track hands checkbox is required for this diagnostic preview. **Close** cancels rather than applying the pending result; it only restores capture that was running before opening.
5. Remove the marker and show a hand. RGB inspection names the matched A/B frames and shows **both / A-only / B-only** contributing joint counts. Points inspection shows actual per-joint weights: A cyan, B purple, both gold. These are contribution weights, not probabilities.

When A loses tracking, valid current B joints remain **registered into A coordinates**; likewise A supports B's loss. Neither valid means no point, never a frozen/filled old joint. Ambiguous, disagreeing or implausibly jumping geometry is still rejected. Stop/Start retains this automatic rig for the same serials/profiles and creates fresh run bindings. Changing a camera/profile invalidates it; moving a camera requires recalibration. Reload/import never supplies rig approval or starts capture.

## Marker preparation

Use one flat, matte, depth-visible tag36h11 target with its white quiet border, visible from the **same side** to both cameras. Settings offers the public-upstream ID 0 SVG; any consistently decoded family ID is selected automatically. Remove duplicate physical copies with the same ID. A tabletop target is fine; a handheld target need not remain at fixed pixels. Avoid folded paper, glossy screens, severe edge-on views or rapid motion. Aim for at least **20 pixels per black-square edge** in both images; more is preferable. No ruler entry is needed: SDK depth supplies observed metric scale, **not certified accuracy**.

## What calibration measures

The native detector reports canonical subpixel corners tied to the exact color frame. SDK-qualified depth from quiet-margin surface patches defines a supported plane; corner rays intersect that plane in each RGB optical frame. Robust plane/edge/shape checks reject holes, unsuitable surfaces and unqualified intra-camera pairs.

The collector retains at most 40 scalar observations per source over eight seconds, pairs the same ID using supported reported clock domains (≤40 ms reported color-time difference and ≤150 ms page-receipt separation), rejects excessive motion-over-skew risk, then uses 12 distinct paired frame groups spanning ≥1.8 seconds: **eight fit / four later check groups**, four corners each. Camera-relative pose repeatability is recomputed by leaving out each fit frame group (5 mm RMS gate), rather than demanding stationary marker pixels. Existing residual gates remain 15 mm RMS / 30 mm maximum / 8 px reprojection RMS.

The result is a proper rigid **B RGB optical → A RGB optical** transform, metres, row-major rotation: no identity guess, scale, shear, reflection or model-hand alignment. Evidence declares `validation:'paired-relative-pose-frames'`, `staticTargetConfirmed:false`, `referenceUncertaintyM:null`, `accuracy:'unverified'`. Later frames are **not independent spatial placements or a physical reference**. The strict manual survey uncertainty rules remain separate and unchanged.

Done applies the same result to the spatial panel; unsaved manual drafts cannot be silently overwritten. Scalar spatial/fusion exports bind serials, exact profiles/intrinsics/extrinsics, observed corners and integrity fields; import recomputes fitting/qualification. Limits remain 64 KiB spatial / 128 KiB setup. No global application configuration, media, hand poses or credentials are written. Spatial files remain spatial-only: `physicalValidation:'operator-required'`, `temporalAlignment:null`, `fusionEnabled:false`.

## Timing is explicit, not fabricated

Automatic live fusion uses **SDK-reported System Time diagnostic matching** for the two local native streams. The pinned SDK defines System Time relative to the host OS clock. The live preview binds exact serial/profile/run IDs, bounded reported color/intra-camera differences, bounded receipt/output age, clock order and gross clock discontinuity. It creates **no zero-offset calibration or synthetic common events**. Temporal uncertainty and effective exposure-time budget remain **null**, exposure synchronization stays false, and the viewport labels **timing unverified**. Unsupported clocks fail closed. This is useful registered diagnostic reconstruction, not an exposure-aligned or physical-accuracy claim.

Measured common-event timing remains an advanced option and is still required for the same-input Best View/Fused benchmark. See [timing, recording and acceptance](fusion.md). A held marker cannot establish exposure synchronization.

## Dependency and verification

Independent public **AprilRobotics AprilTag 3.4.5**, BSD-2-Clause; pinned SHA-256 in `bridge/marker-assets.json`, bounded verified build-time download (10 MiB / 60 seconds), ignored local cache, license beside the helper and in Settings. Fixed tag36h11, one detector thread, ≤one pass/200 ms, ≤16 detections. A bounded detector-only 2× fallback helps small/low-contrast tags; corners return to original pixel coordinates. Decode/margin gates are heuristics, not confidence. No extracted proprietary code is executed or reused; see the [static tool analysis](../../../../docs/hand-tracking/calibration-tool-analysis.md).

232 Hand Tracking Input tests, strict live check/build and three native CTests pass, including public IDs 0/1/586, four rotations, canonical corners and small/low-contrast vectors. Generated development/production browser fixtures use moving tags, explicit 100 mm baseline, generated depth and the official public hand photo through **two real model workers**. Done→Fused, both contributions, A loss/B-only, B loss/A-only, both loss clearing 3D, recovery, fresh-run Stop/Start, export/import, camera-free opening, cancellation, preferences and cleanup pass with zero exceptions. This proves software behavior, **not calibration, sustained performance or fusion acceptance on the operator's physical rig**.
