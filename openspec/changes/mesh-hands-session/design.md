# Design

## Context

See `proposal.md` for motivation. This task's clean branch was fast-forwarded from its old pool snapshot to `main@a3549fd6c5c846e2a23f383815b2828cc52b7a3d`, including the merged contracts foundation, before creating this plan.

Observed implementation:

- `HandSessions` owns provider preparation, exact-page authorization, worker supervision, heartbeat/reload/crash cleanup and applied skeleton profiles, but no mesh owner. `prepareHandSession` returns no post-processing snapshot.
- `Panel.meshRun` currently belongs only to a managed native launch. Post-processing save/retry/status resolve only that field. `HandMeshRun` already supports stable gateways, None/replacement, acknowledged live configure, generation fencing, bounded preparation and contained cleanup.
- `hands-view.js` samples after shared ingress and updates interaction and `HandVisual`, without a mesh client. `hands-session.js` owns retirement; the SDK module allowlist does not expose the mesh client's complete import graph.
- `HandMeshClient.update` discards surfaces beyond 33 ms dispatch age or 10 mm maximum raw joint displacement. `pump` also rejects replies beyond 33 ms. The service times out a frame at 33 ms, and both service and SDK drawing evidence expire at 33 ms. Changing only the visual would leave upstream rejection intact.
- `HandMeshVisual` uploads panel-space vertices and uses a transparent, double-sided material with skeleton opacity. `HandVisual` already keeps Joints/Bones independent; protect that behavior instead of introducing a mesh-as-skeleton replacement policy.
- Existing SDK mesh tests cover codecs, topology, observation provenance, generation and drawing evidence. Panel tests provide fake contained processors, session lifecycle fixtures and managed-app held-interaction parity.

The current specs explicitly require 33-ms expiry and still describe no Hands mesh consumer and desktop-only context text. The deltas intentionally replace those limitations; source-only pose, lease, recording and interaction rules remain unchanged.

## Goals / Non-Goals

**Goals:** One reusable optional service/control boundary for the active Hands or managed-native consumer; continuous rigid attachment between results; conservative articulated-pose rejection; coherent age/drawing evidence; independent opaque mesh rendering; isolated repeatable measurement.

**Non-Goals:** Settings controls implementation, a fitter or anatomical solver, runtime/model installation, camera operations, source-provider live reconfiguration, a second mesh wire format, browser/WebXR app support, replay mesh ownership or offline packaging. Hands is a panel-owned local consumer, not an extension of ordinary browser-app execution policy.

## Decisions

### 1. Session owns an optional gateway, not acquisition

Extend session preparation with a read-only pinned mesh choice/settings/revision and the checked supervisor location from the selected runtime. Add an injectable mesh-owner factory to the session boundary so lifecycle tests do not need real runtime files. Create the gateway only for explicit Start; None creates no processor. Start skeleton acquisition independently of slow optional validation/preparation. A missing supervisor, declaration or runtime produces mesh-only guidance. Recheck cancellation after every asynchronous operation; a late gateway/factory result must be stopped rather than adopted.

Keep a session-owned reference through verified cleanup, including retryable cleanup failure. Retire credentials and requests immediately on Stop, page/reload/heartbeat loss, provider crash and panel shutdown. Provider lease release remains based on provider death, not on processor cooperation; mesh never reserves or holds that OS lease. Failed mesh cleanup must still block unsafe mesh reuse and remain visible, without holding skeleton interaction hostage. New session/provider work cannot accidentally adopt a retired mesh run.

Reuse `HandMeshRun.start/configure/retry/unavailable/state/stop` and stage-1 containment, never direct child launch. Initial values are the Start snapshot; later committed profile writes reconcile through the same ordered generation path. No separate mesh acquisition job or automatic crash-restart loop.

Alternative rejected: let the page launch its own processor or reuse the provider's containment job. Those lose authoritative lifecycle or couple optional cleanup to input ownership.

### 2. Route committed configuration to the actual active owner

Introduce one internal active-mesh-owner lookup for panel post-processing save/retry/status, resolving a live Hands owner or the managed-native run. Native acquisition arbitration normally prevents both; bind retry to exact run ID and saved revision, never choose by last response or label. Keep existing public post-processing response shapes so the parallel controls module can consume them unchanged. Persistence succeeds independently of mesh reconciliation. Idle saves start nothing.

Expose the Hands descriptor only to its authenticated owning page through the existing session response boundary; never expose it in a public status read, profile, recording, URL or portable output. Preserve exact panel Origin checks on the mesh gateway. Retired page/socket responses cannot create a client for a replacement session. Keep separate profile applied acknowledgements and processor/drawing evidence.

The parallel settings-controls task owns `ui/hands-postprocessing.js`, including context copy. Do not edit that module here. Backend changes stay compatible with its load/save/retry contract; notify the coordinator of the newly supported Hands context.

Alternative rejected: add a second settings delivery protocol or treat a skeleton-profile ACK as mesh application.

### 3. Reuse SDK transport and drawing in Hands

At successful live-session attachment, create the SDK `HandMeshClient` with the owner-only descriptor. Feed admitted acquisition identities into `observed`, and dispatch copies of `input.sample(now)` after interaction updates on each render. Pass the same ingress geometry generation used by the view. Use `HandVisual.updateMeshes` rather than a viewport-specific renderer. Expose only the necessary mesh-client/protocol/helper import graph through the checked SDK allowlist.

Geometry edits invalidate mesh with ingress resets; appearance edits preserve compatible results and holds. Empty/stale input clears geometry immediately, independently of skeleton loss grace. Session retirement closes the client and disposes mesh GPU resources; replay/idle paths never attach it. Managed native SDK drawing continues through this same client/visual path without app changes.

Alternative rejected: send raw worker packets to the processor or apply adjustments in the view again. Both break final-pose parity and observation association.

### 4. Carry immutable source-pose association into the visual

Retain the exact copied pose for each accepted response, including handedness, identity and original local snapshot time. Pass source association as SDK-local drawing metadata; do not add fields to the processor packets or change negotiated capability names. Derive a stable orthonormal wrist/palm frame from wrist and noncollinear palm landmarks in both source and current sampled poses. Reject nonfinite/degenerate frames and unsafe chirality changes instead of guessing orientation.

Every render compute `delta = currentWristFrame * inverse(sourceWristFrame)`. Apply it to the original mesh, never to last render's compensated positions. Prefer a per-hand object transform under the panel-to-world group so rigid compensation does not reupload all vertices or recompute normals every render; rotate normals with the same transform. Upload only replacement plugin geometry. Apply panel mapping once. This is current rigid anchoring, not a new tracking filter or a claim of freshly solved finger articulation.

A shared compensation validity calculation must govern both visual output and SDK drawing evidence. It evaluates the maximum source-joint-to-current-joint residual **after** rigid transformation, initially capped at 10 mm, not raw displacement. Preserve malformed/identity/generation/topology fences. Basis degeneracy or articulation beyond tolerance hides only mesh. Do not infer confidence/support from residuals.

Per-finger correction is optional only if a cheap, deterministic source-to-current deformation preserves seams, normals and attachment under open/fist/pinch/occlusion fixtures. Rigid compensation is the required baseline. Do not add an unmeasured nearest-bone deformation merely to lower fallback statistics; document remaining articulation fallback if a robust correction is not justified.

Alternative rejected: enlarge raw displacement tolerance or extrapolate processor output velocity. Neither guarantees attachment to the actual current skeleton.

### 5. Bound plausible reuse by source age, not the old dispatch guard

Use a common named compensated lifetime, initially 100 ms, and retain the two-second stuck-work watchdog and existing bounded queues. The client tracks the immutable local snapshot creation time separately from `sentMs`, which is refreshed at dispatch, and from `sampleMs`, which may include a prediction horizon. Pending work does not become younger when dispatched. Results beyond the source bound are never drawable, even if HTTP delivery is recent; future/backwards local-clock inconsistencies reject.

Replace all unconditional 33-ms geometry/drawing gates along service delivery, client acceptance/update and state getters with coherent compensated-lifetime rules. The service bounds dispatched work at 100 ms; the client enforces the stricter original source-snapshot lifetime and residual. A missed/204 reply may retain the previous still-valid surface, but a failure, generation change, loss or stop cannot. Drawing-generation evidence requires actual valid enabled drawing and expires even without another render/response. A retained readiness ACK is never drawing proof. Service evidence remains a bounded observation of client reporting, not a promise of physical scanout.

Old clients can still reject at 33 ms; retain their packet parsing and honest unsupported/rebuild semantics rather than falsely claiming they compensate. No change to provider ABI, HANDS wire format, native bootstrap or processor v1/v2 packet identity. Document the new reuse bound and how it differs from observation age and fitting latency. Measurements may justify tightening the 100-ms bound, never extending beyond it just to meet a target.

Alternative rejected: refresh age on every render, retain geometry indefinitely, or modify only the client while the service still drops every late frame.

### 6. Independent opaque material

Default mesh material is lit, opaque, depth-writing and front-face only. Reuse global bone colour; skeleton opacity intentionally no longer drives mesh opacity. Retain the existing skeleton/indicator materials and independent Joints/Bones switches. Mesh absence does not force-show an intentionally hidden skeleton, and mesh presence never hides an enabled skeleton. Standard visual opt-out still suppresses both and clears drawing evidence.

Alternative rejected: retain translucent double-sided skin to match the skeleton opacity slider. It obscures shape and shows back faces, contrary to the requested default.

### 7. Fake-only validation and paired motion evidence

Use public synthetic geometry and fake processor latency; private harness use, if needed, is read-only with all scratch/caches/output in the task folder. Do not copy private source/assets into core or modify another checkout. The fake route is sufficient and safer for this task's standing constraints.

Capture paired before/after still, normal and fast sequences under identical input, 18-33-ms realistic latency with jitter/tails, two hands and explicit render cadence. Include both 60-Hz and 30-Hz render controls and sustained translation/rotation plus changing finger articulation. Retain all raw samples and failure reasons. Report mesh-unavailable hand-render fraction after warmup and startup separately; selecting hidden skeleton switches must not change its denominator. Report original source-to-draw age P50/P95/P99, current-anchor residual, actual cadence and compensation CPU cost. Re-anchoring cannot make old solved geometry have zero age.

Target fast-motion unavailability well below 5 percent without detached/swimming skin. Preserve before/after images or short sequences and inspect open/fist/pinch/fast attachment, handedness and back-face lighting in the actual SDK visual. If articulation or latency tails miss the target, report the miss and its cause rather than hide failures or loosen safety. Real anatomical fitting and physical camera/scanout quality remain unverified.

Extend focused SDK/session/API/browser tests for cleanup races, final-pose parity, generation/topology retirement, material/toggle independence and held-interaction invariance. After implementation run the explicitly requested whole control-panel package once before publication, in addition to focused checks; do not run the repository-wide suite. This is a plan-only handoff: no measurement or application is started before approval.

## Risks / Trade-offs

- [Rigid compensation does not update finger articulation] -> Residual-gate bounded reuse, measure articulated motion and honestly retain fallback; optional finger correction needs visible robustness evidence.
- [A palm frame can become degenerate or flip] -> Check basis conditioning/handedness and reject mesh instead of applying an unstable transform.
- [A longer lifetime can expose old fitting error] -> Enforce original snapshot age plus post-compensation residual, preserve loss/configuration fences and cap reuse at 100 ms.
- [Mixed session/native owners or delayed Start completion] -> Exact run/page binding, cancellation guards, one active-owner lookup and retained verified cleanup state.
- [Opaque depth occludes some skeleton behind the skin] -> Keep draw visibility independent and test the switches; occlusion is not automatic hiding.
- [Synthetic success is not anatomical quality] -> Label fake geometry/latency and all unmeasured real-provider/fit/scanout limits explicitly.
- [Parallel controls work touches the same backend contract] -> Preserve response shapes and do not edit its UI module; coordinate context copy rather than bundling its scope.

## Migration Plan

1. Add Hands ownership and descriptor delivery behind explicit Start with passive idle behavior and unchanged saved profile format.
2. Wire the shared viewport client, then update the SDK compensation and coordinated service/client lifetime gates with regression tests.
3. Switch only mesh material defaults; retain appearance data and skeleton material semantics. Update documentation to distinguish skeleton opacity from opaque skin.
4. Existing apps need an SDK rebuild for compensation; old bundles remain safe but may keep poor 33-ms/raw-displacement fallback. No implicit runtime install or user-state rewrite occurs.
5. Roll back by selecting None or reverting the code. Preserve plugin choices, preferences, recordings, prepared runtimes and source settings; do not delete user data.
