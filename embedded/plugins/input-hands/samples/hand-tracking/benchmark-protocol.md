# One-camera comparative bench — implementation contract

Authorized scope: finish RGB-D record/replay prerequisites, then Stage 5 measurement/comparison. No fusion, fitting, smoothing, prediction, panel calibration or live application publishing. Existing RGB recording remains compatible. Native acquisition/pairing remains viewer-managed; opening a page/importing a file never captures or records.

## Delivery slices

Stage 4's reconstruction implementation and automated checks are complete. Independent ruler/hand feasibility acceptance is still unverified, not waived or claimed by starting software work on Stage 5. The operator explicitly requested finishing Stage 4 and starting Stage 5 in the same worktree.

The first Stage 5 slice added lossless, bounded RGB-D recording/import/export/replay and fresh sequential depth A/B reconstruction on identical saved inputs. It reuses the Record controls and preserves RGB v1 compatibility. Comparison exports initially cover depth acceptance/rejections, source gaps and component processing timings only. That initial boundary is now superseded by the completion below. No unannotated clip is presented as tracking accuracy/availability evidence.

## Stage 5 completion scope

The operator requested completing Stage 5. Implemented annotation-bound metrics for both RGB and RGB-D, including explicit expected hand count, stationary intervals, bounded gap handling, censored interruptions/reacquisition and per-track geometry statistics. The scalar timeline/dashboard and versioned report/annotation export/import bind to exact clip content. Fresh RGB-D VIDEO-model reruns, sequential reconstruction and synchronized 2D/3D views preserve distinct coordinate frames. Render telemetry records only actual comparable-clock submissions; old clips retain unknown timing. Synthetic denominator and browser fixture end-to-end checks pass. See [operator workflow and exact definitions](benchmark.md). Optional proprietary reference import remains unavailable without supplied data/rights. Stage 6 and physical accuracy qualification are not part of this request.

## Inputs and privacy

- RGB `.handtracking` version 1 remains lossless PNG + original observations.
- RGB-D version 2 uses `XRBHTRK2`, a bounded manifest and per-frame JSON + lossless deflate-compressed **complete original XRB3 packets**. RGB8, original little-endian Z16, separately SDK-aligned Z16, original stamps/counters, actual calibration/scale/extrinsics and original optional model observations stay separate. No 8-bit depth, silent RGB substitution, fake camera media-time or image upload.
- The explicit Record button is the admission boundary; fence pre-start/in-flight results including rounded-clock ties. One encode/decode at a time, 20 s / 600 frames / 128 MiB container limits, bounded decompression and hash/geometry/timing/source validation. One clip lives in memory; export/import/delete remain explicit.
- Preserve actual capture settings/backend, per-frame sampling settings, clock-offset uncertainty and software timings. Exposure capture time and capture-to-photon remain unknown. No tracking key/token is recorded.
- Fixture tests may retain only labeled public/generated inputs. Hardware smoke tests retain scalar metadata only; no saved hardware images/raw hand poses. Human/ruler validation requires the operator.

## Comparison and metrics

- A and B consume the same clip/frame indices/calibration. Raw model coordinates remain hand-relative; reconstructed visible surfaces remain color-camera metric. Different coordinate frames use separate 3D views, never a false common-world overlay. Same-camera depth A/B may be overlaid with distinct colors.
- Reconstruction comparisons start fresh and process all saved frames sequentially. Live model/reconstruction pre-roll before Record is not restored. Seeking a frame for inspection must not be presented as a different inference history or a tracking benchmark.
- Original observations remain immutable. Optional model reruns start a fresh pinned VIDEO model and preserve recorded timestamp gaps; completed caches are separate. Repeatable geometry/quality output does not imply identical runtime durations or universal GPU determinism.
- Report processing-frame counts and time-weighted availability separately. Availability requires explicit visibility annotations and expected hand count. Unknown visibility is not ground truth. Source gaps remain visible and do not silently extend tracked time indefinitely.
- Count tracked-to-lost transitions only within annotated visible intervals; report interruption duration, longest interruption and right-censoring. Reacquisition follows annotated occlusion, not guessed physical reappearance. Initial acquisition is separate.
- Stationary jitter is available only for operator-annotated stationary/visible intervals. Report coordinate frame, joint, sample count, units and missingness. This is observed variability, including residual motion; no motion compensation or accuracy claim.
- Segment-length variation describes observed landmark segments, not verified anatomical bones. Invalid geometry/constraint rejections are counted, not fabricated joint-angle truth.
- Source receive-to-render uses comparable page clocks where actually observed; inference/pixel/reconstruction durations keep their own meanings. Transfer estimates retain clock-offset uncertainty. Sensor-to-host and capture-to-photon stay null where unmeasured.
- A report includes clip identity/content hashes, hardware/profiles/calibration provenance, model/runtime/implementation versions, configuration, annotations, denominators and limitations. Export aggregates/timeline/configuration only, not images or raw poses. Accuracy remains unavailable without independent reference measurements.

## Operator protocol (still unverified)

1. At intended placement, inspect independent flat targets at measured RGB optical-axis Z near the center and edges. Leave unknown references empty; document setup uncertainty.
2. Check palm and fingertip depth acceptance over the working range, edge/background snaps, occlusion and reacquisition. Actual hand quality is not established by a generated depth plane.
3. Explicitly record short stationary-open-hand, slow/fast-wave, volume-edge, palm-rotation/curl, crossing-hand and partial-occlusion clips. Keep hardware recordings private/local.
4. Annotate visible/occluded intervals, expected hand count and stationary intervals; compare A/B on identical inputs and export the scalar report if desired.
5. Actual USB unplug/replug, longer station soak, CEF, model-weight rights and the two inherited SDK typing errors remain separate open gates.

Public setup and verification limits are described in the [diagnostic guide](README.md). No physical pass or tracking improvement is claimed by this plan.
