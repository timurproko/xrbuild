# Compensated hand mesh motion

The SDK keeps the processor's immutable final-pose snapshot and its local creation time. Every render, skin is
rigidly re-anchored from that snapshot's wrist/palm frame to the **current sampled** wrist/palm frame. Rotation
also transforms normals. Original geometry is uploaded only on a new result; the per-hand object matrix changes
between results, without cumulative vertex deformation or a second global size/offset. Interaction still uses
only skeleton joints.

`MESH_MAX_SOURCE_AGE_MS` in `packages/sdk/src/hand-mesh-protocol.ts` is **100 ms**, shared with the service's
bounded dispatch/drawing policy. This is a maximum reuse allowance, not a latency target. The client measures
age from original local snapshot creation, not refreshed dispatch time, future predicted sample time, last
render or response receipt. A paused renderer's drawing evidence still expires. The two-second stuck-work
watchdog and one executing/one newest pending frame remain separate.

After removing wrist motion, `MESH_MAX_RESIDUAL_M` is **10 mm maximum joint residual**. Degenerate/nonfinite
palm frames, changed identity/handedness, explicitly unsupported anchor joints, coasting/lost input and retired
pose/settings generations reject skin. Unknown observation evidence stays unknown. This residual checks pose
change, not anatomical model fit or confidence. No per-finger correction is enabled: without a rig/weights,
nearest-finger displacement risks seams and swimming. Large articulation correctly remains unavailable.

## Why 100 rather than 33 or 66 ms

The explicit benchmark `packages/sdk/test/mesh-motion-bench.ts` exercises the actual SDK client, codec and mesh
visual with a virtual-clock fake processor: two authored 2,720-vertex tube skins, 18/20/23/26/29/33/22-ms latency
and one 80-ms tail per 100 requests, default one-in-flight/latest-pending scheduling. There are two seconds of
warmup and twenty measured seconds per motion/cadence. Still, normal and fast use the same latency schedule;
fast adds up to .84 m/s wrist translation and 4.9 rad/s rotation with modest simultaneous finger articulation.
A separate severe articulation stress is deliberately outside rigid compensation's useful range.

Candidate age-cap fractions below apply 33/66/100-ms source-age gates to the **same accepted result schedule**,
not independent throughput runs. This isolates visible reuse policy; a different request/transport scheduler
could change the numbers. Baseline uses the original client and its original 33-ms dispatch/raw-displacement
policy; it can draw geometry whose original source age is greater than 33 ms because pending dispatch refreshes
its clock. Do not confuse that bug with compensated source-age measurements.

| Render cadence / motion | Baseline unavailable | Compensated at 33 / 66 / 100 ms | Visible source age at 100 ms P50/P95/P99 |
| --- | ---: | ---: | ---: |
| 60 Hz, still | 59.17% | 100 / 8.33 / 0.17% | 50 / 66.67 / 100 ms |
| 60 Hz, normal | 59.17% | 100 / 8.33 / 0.17% | 50 / 66.67 / 100 ms |
| 60 Hz, fast | 95.96% | 100 / 8.33 / 0.17% | 50 / 66.67 / 100 ms |
| 30 Hz, still | 99.00% | 100 / 3.33 / 0% | 33.33 / 33.33 / 100 ms |
| 30 Hz, normal | 99.00% | 100 / 3.33 / 0% | 33.33 / 33.33 / 100 ms |
| 30 Hz, fast | 100% | 100 / 3.33 / 0% | 33.33 / 33.33 / 100 ms |

The 100-ms allowance removes otherwise avoidable cadence/tail dropout; a 66-ms source cap still drops 8.33%
of fast renders at 60 Hz in this schedule. Wrist attachment error after compensation is below 1e-12 m in these
synthetic rigid tests. Modest-articulation visible residual P99 is about 4.6 mm. Severe-articulation unavailability
remains **85.58% at 60 Hz / 82.17% at 30 Hz**; rigid anchoring is not finger retargeting.

## Actual transport and rendering limits

`packages/control-panel/test/fixtures/mesh-motion-wall-bench.ts` adds a separately contained fake processor,
private binary pipes, authenticated loopback HTTP, both real SDK clients, source filtering and the Hands WebGL
viewport. It runs only when explicitly supplied disposable browser/supervisor/proof paths. It never starts a
provider, camera or person's panel. Before/after service/client versions can be compared from task-owned source
copies; private plugins/assets are unnecessary. It records every hand-render and captures actual viewport PNGs.

On the initial local Windows headless/software-rendered run, 60-Hz render submission produced approximately
300 renders per five-second measured phase after warmup. Baseline unavailable fractions were 100% for all
phases. Compensated still/normal/fast were **3.32 / 8.00 / 20.17%**; visible source age was roughly 67 ms median
and 85-100 ms at P95/P99. Candidate 33/66/100-ms fast fractions were **100 / 77.67 / 20.17%**. These results
**miss the fast-motion target** despite passing the controlled-clock fixture, and cannot be presented as a
60-Hz model/display guarantee. Real pipe/browser scheduling tails and deformation of independently filtered
rotating joints remain limitations. The extreme articulation stress remained 93.50% unavailable. Keep safety
guards; do not increase age or residual limits to hide this miss.

The task handoff retains raw rows, exact revisions, current final-tree transport measurements and captures.
CPU timings from the virtual benchmark include client dispatch, allocations, geometry uploads and normal
computation, not isolated GPU work. Neither benchmark measures physical scanout, optical capture latency,
real fitting quality, device runtime contention or anatomical attachment. Re-anchoring improves current rigid
placement; it **does not make old solved articulation zero milliseconds old**.
