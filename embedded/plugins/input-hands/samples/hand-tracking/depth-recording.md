# RGB-D v2 recording and first depth comparison bench

This describes the v2 foundation delivered in Stage 5. The [complete benchmark guide](benchmark.md) covers the now-implemented dashboard, annotations, timing, synchronized views and fresh model B reruns. Stage 4's software reconstruction is complete; physical ruler/palm/fingertip feasibility remains unverified. No fitting, smoothing, fusion, prediction, panel transform or application input is introduced.

## Use

Reuse the viewer at `http://127.0.0.1:5190/`, or start it:

Use the normal panel's `/hand-tracking/` tool after explicit bundled setup. Optional model/device dependencies and
capture require separate configuration/actions; generated fixtures need neither.

1. Choose a native serial in Capture and explicitly Start capture. Opening the page, connecting, enumerating devices and importing never acquire images or record. Track hands may be disabled for depth-only clips.
2. With everyone's permission and no sensitive surroundings visible, open Record and press **Record RGB-D**. Camera Start alone does not record. Stop recording; export if desired. The limits are 20 seconds / 600 retained frames / 128 MiB encoded container budget. One compressor is in flight and busy arrivals are counted, not queued.
3. Press Replay. Native capture stops. Every saved packet is decoded sequentially into two fresh reconstruction histories before replay: A uses each frame's recorded sampling; B initially uses the first frame's sampling. Live pre-Record history is not restored.
4. Play/Pause, exact frame-index seek, previous/next and speed use the saved receive-time gaps. RGB/depth previews and geometry use the same saved frame. In Depth comparison, choose A (gold), B (purple), their camera-metric overlay, or the separate raw hand-relative view. Raw and measured origins are never overlaid as a common frame. Depth heatmap/invalid-mask settings remain available in Depth.
5. Edit B radius/coverage/spread and explicitly Run comparison to recompute all saved frames sequentially. Other B thresholds remain those of the first recorded frame. Editing fields does not mutate the previous completed cache. Cancellation never publishes a partial cache; a previous complete cache may still be inspected/exported.
6. Export comparison report for scalar acceptance/rejection counts, source counters, timing components and provenance. It contains no images or raw poses. This is **depth-sample acceptance, not tracking availability or accuracy**. Unknown ground truth, visibility, jitter and reacquisition metrics remain null.
7. Delete from memory before importing/recording another clip. Local import validates all frames before adoption and never opens a camera or model. RGB v1 remains supported with its existing sequential model rerun. For RGB-D, select Re-run model to run a fresh B VIDEO model on all saved RGB8 frames with their original timestamp gaps, then reconstruct sequentially. Actual delegate/fallback/settings are recorded in the completed cache; no imported asset filename is loaded. Captured mode still supports depth-only A/B on stored observations.

The [shared privacy/retention rules](recording-format.md) apply: one in-memory clip, explicit export/import/delete, no upload/automatic persistence, ignored `*.handtracking` files, no credentials, and exports deleted manually through the file manager. A browser download attempt does not prove the operator saved the file. The cap is encoded data, not total browser memory; decoded pixels, observation objects, two bounded reconstruction caches and worker/model overhead are additional. An already admitted compressor may finish after Stop; Delete fences it and prevents a second compressor until it settles. No hardware footage was saved by automated verification; retained browser-test files contain only labeled public/generated fixtures.

## Binary contract

All lengths are uint32 little-endian; metadata is bounded UTF-8 JSON. Same outer framing as v1, but different magic, schema and payload encoding:

```text
8 bytes  ASCII XRBHTRK2
4 bytes  manifest JSON length
N bytes  manifest JSON
repeat manifest.frameCount times:
  4 bytes  frame metadata JSON length
  4 bytes  deflate payload length
  M bytes  frame metadata JSON
  P bytes  zlib-wrapped deflate of ONE complete original XRB3 wire packet
EOF (no trailing bytes)
```

The uncompressed packet retains its exact header/metadata/RGB8/original little-endian Z16/SDK-aligned Z16 bytes. It is not PNG/colorized depth, RGB-only substitution or camera-raw Bayer/YUV. Maximum compressed/uncompressed frame is 4 MiB; every JSON chunk is at most 128 KiB. Streaming decompression rejects output beyond the declared bounded packet length before collecting another chunk. The packet SHA-256 is checked before interpreting its complete qualified 640×480 planes. Checksums detect corruption, not authenticity or measurement truth.

Manifest declarations: `format:"xrbuild-hand-tracking"`, `version:2`, `encoding:"deflate-xrb3"`, `timebase:"relative-browser-receive-ms"`, `topology:"mediapipe-21"`, `privateEvaluationOnly:true`. It preserves identity/start/stop/reason/drop counters, actual requested model settings/backend (null delegate for no model), pinned asset provenance, native serial/run source ID, actual calibration/profiles/intrinsics/extrinsics/scale and page time origin/display mirroring. No token/bridge endpoint is captured.

Per-frame metadata contains `index`, `relativeMs`, `packetBytes`, `packetSha256`, optional original observation (null if model disabled), actual sampling settings, receive/completion page clocks, pixel/reconstruction durations, transfer approximation and nullable native/bridge/page offset estimates with uncertainty. Native RGB-D observations have **no browser media time**. An optional nullable `presentedPageMs` now records the first actual render submission of an admitted packet on its comparable page clock; missing/old telemetry remains unknown. Recording reserves bounded metadata space for this later timestamp; it never modifies original packet bytes. Source run/serial, model provenance, timeline and native sequence/steady receive order must agree. The first relative time is zero; later times strictly increase and duration equals the final retained time. Original source gaps/repeats, device stamps/domains and nullable exposure/readout metadata stay inside the original packet. Device gaps, transport consumer skips and recorder encoder skips are distinct. A source sequence fence rejects already received pre-Record packets even when page clocks round to ties.

## Comparison report and remaining Stage 5 work

`xrbuild-depth-comparison` version 1 / implementation `depth-ab-2` identifies the clip by a SHA-256 of canonical manifest and ordered canonical per-frame metadata hashes (including each original packet hash). Reports include original hardware/calibration/model/settings, A/B configuration, processed-frame and landmark-sample denominators, accepted surface/palm/tip counts, rejection reasons and scalar frame timeline/source counters. No confidence or joint-center ground truth is manufactured.

Pixel/inference/reconstruction/receive-to-processed durations keep their own clocks and meanings. Transfer is approximate with clock uncertainty. Capture-to-photon and sensor-to-host stay null. Repeated geometry/configuration on identical fixture inputs is consistent; runtime durations and universal GPU determinism are not promised.

Stage 5 now implements visibility/expected-hand/stationary annotations, gap-aware time availability, interruptions/censored reacquisition, per-track stationary variability and segment variance, synchronized 2D/3D views, RGB-D model B reruns and the metrics dashboard. Use [the benchmark guide](benchmark.md) for definitions, clip-bound annotation portability and the full scalar report. The original depth-sample report remains separate; it must not substitute point acceptance for annotated tracking availability. Independent reference targets, real hand usefulness, unplug/replug/station soak, CEF permissions, device qualification and model redistribution rights remain open gates. See the [benchmark protocol](benchmark-protocol.md) and [public setup/acceptance limits](README.md).
