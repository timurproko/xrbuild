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

The final local Windows headless/software-rendered paired run produced 300 renders per five-second phase
following 1.2 seconds of warmup. Its fake worker injects 3-10 ms compute-scale delay (plus a 1% 45-ms tail),
**not another 18-33 ms end-to-end delay on top of real IPC**. Actual HTTP-to-headers P50/P95/P99 in the fast
phase was 26.5/33.3/44.5 ms; body decoding and rendering are additional. Baseline and compensated processors
ran together for paired input, so this is conservative shared-browser/workstation evidence, not isolated model
throughput. Source filtering is the actual default SDK filtering.

| Motion | Baseline unavailable | Compensated at 33 / 66 / 100 ms | Visible source age at 100 ms P50/P95/P99 |
| --- | ---: | ---: | ---: |
| Still | 70.67% | 89 / 16.67 / 1% | 49.6 / 67.3 / 83.5 ms |
| Normal | 61.67% | 85 / 12 / 0% | 49.3 / 67.2 / 68.7 ms |
| Fast | 95.33% | 90.67 / 22.33 / 7% | 49.6 / 67.4 / 87.4 ms |
| Severe articulation stress | 98% | 99.33 / 88.67 / 87.5% | 49.8 / 67 / 70.8 ms |

Fast visible residual P50/P95/P99 was 3.99/8.07/9.32 mm. **The 7% real-transport fast fraction still misses
the well-under-5% target** despite passing the controlled-clock fixture. Pipe/browser scheduling tails and
nonrigid deformation of independently filtered rotating joints remain limitations. No unvalidated finger
warping or larger residual/age limit is used to hide that miss. Earlier over-delayed transport probes (18-33 ms
injected in the worker *plus* real transport) yielded 20-34% fast unavailability and are retained in task
artifacts; they are not the corrected compute-scale measurement or a reason to advertise a latency guarantee.

The task handoff retains raw rows, exact revisions, current final-tree transport measurements and captures.
CPU timings from the virtual benchmark include client dispatch, allocations, geometry uploads and normal
computation, not isolated GPU work. Neither benchmark measures physical scanout, optical capture latency,
real fitting quality, device runtime contention or anatomical attachment. Re-anchoring improves current rigid
placement; it **does not make old solved articulation zero milliseconds old**.
