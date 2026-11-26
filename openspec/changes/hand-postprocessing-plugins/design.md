# Design

## Context

See proposal.md for motivation. This is a plan, not a claim of implemented processing or measured model performance.

Verified baseline: main `48a59a5852237bcbaada593ad566b60f9f99c709` (merged PR #48). The allocated branch initially pointed to older `4c03fc8`; it was clean and fast-forwarded to main before authoring this plan. PR #50 is open, inspected at `c7c2a1e8f78b7f0a968e87aea56f46533edc2338`; its delivered code is a dependency, not assumed merged. The supplied prior investigation's two-slot proposal is the starting point, corrected below against these sources.

| Observed seam | Consequence for this design |
| --- | --- |
| `packages/sdk/src/hand-source.ts` exposes identity `prepareHandFrame` and policy/generation-gated `HandFrameIngress`. PR #50 adds the one wrist-size/offset transform here. | Add skeleton processing immediately before that transform; never implement it again in a provider, native host or mesh. |
| `index.ts` calls `HandInput.sample(now + displayLatencyMs)` before scene conversion, interaction and `handsObject.update`; the sampled `Hand` differs from `WireHand`. | Geometry must receive this sampled/predicted canonical pose, not the most recent ingress frame. Add a distinct sample sequence and labelled source provenance. |
| `hands.ts` retains a 400 ms default tracking grace and native grab by default; native pinch is opt-in. `Hand` has no scores or full optional wire fields. | Geometry must invalidate on explicit no-detection independently of grace. Retain scores/native fields separately as source provenance, not invented final-pose confidence. |
| `hands-state.ts` owns version-1 `config/hands/profile.json`, content revision, lock, atomic replacement, workspace scope, unknown preservation and a 16 KiB limit. | Extend the same transaction introduced by PR #50; do not add processor settings to plugin preferences or a second profile file. |
| `hand-providers.ts` uses native binary queries to identify skeleton providers; `extension-catalog.ts` resolves origin, enablement and containment without executing a processor. | Reuse catalog ownership only for stages. Do not copy source probing into metadata-only stage discovery or import ordinary service factories during a stage-list request. |
| PR #50 `handProfile()` constructs an adjustment-only DTO, and `hand-profile-control.ts` accepts only portable profile version 1 with an 8 KiB control cap. | An unknown `processing` field would currently be discarded. Add a versioned required-processing DTO and capability negotiation through panel, host and SDK; increasing only the disk limit is insufficient. |
| PR #50 implements run-bound full snapshots, sequences and SDK acknowledgements, including initial ingress gating and frame-boundary releases. | Reuse that run identity/order/ack path. Pipeline saves are next-run-only, while adjustment Apply must carry the active pinned pipeline, not accidentally activate newly saved stages. |
| `HostRunner` owns native/dev processes and emits state; there is no processor supervisor. Native source callbacks still publish ordinary binary hands. | Introduce a run-owned supervisor/broker alongside it, never a second acquisition owner or changes to the input ABI. |
| `ui/hands.js` currently owns a source form. PR #50 plans a separately mounted adjustment component; another change owns the page layout. | Ship a separate root-scoped component and mount contract, not a page redesign or another adjustment form. |

## Goals / Non-Goals

**Goals:** provider-neutral required processing, bounded async execution, common geometry with no app edits, exact disabled compatibility, next-session global configuration, honest supported-context boundaries and inert tests of both adapters.

**Non-Goals:** any real processor, model/assets installer, camera or inference runtime setup, changes to provider code/calibration, additional landmark layout, new gesture/filter algorithms, live provider session worker, shared capture broker, editing user apps, model-quality claims, automatic bypass, or offline/deployed processor distribution. Browser-source behavior with no stages remains supported; initially enabled stages execute only in managed native runs.

## Decisions

### 1. Versioned declaration and installed registry

Add optional `handStages` to `PluginMeta`, parsed by a dedicated browser-safe contract with panel filesystem checks. Each entry declares:

- `version:1`, local stable `id`, bounded label/description, implementation version and expected content digest; fully qualified key is `{owner: plugin.key, id}`. The owner comes from the catalog, never arbitrary metadata.
- Fixed `slot: skeleton | geometry`, `inputSchema`/`outputSchema`, execution kind `worker | sidecar`, contained entry module/program and argument array, supported contexts (initially `managed-native` only).
- Settings schema version and at most 32 bounded boolean/number/select/text fields using the existing `PluginSetting` field model. Text is bounded, never a credential, program, command or filesystem path. Defaults are validated. All stage settings require restart in v1.
- Required capabilities, asset/runtime inventory references, expected implementation identity, optional dependency IDs and declared output channels. No discovery-time executable readiness probe, global PATH search or install/download URL execution.
- Resource limits and deadline request, reset/dispose support, skeleton signal policy and optional `supportsBypass`; geometry stages cannot change interaction or claim skeleton output.

Limits: at most 8 declarations per plugin, at most 8 enabled stages total, 8 KiB settings per stage, 64 KiB declaration metadata, one standard `mesh` writer per hand. Reject cyclic or unsatisfied dependencies and dependency order violations; do not auto-reorder saved stages. Slots have fixed order; saved array order applies within each slot. Multiple geometry stages are allowed only for nonconflicting declared channels; unknown optional channels remain ignorable by app consumers, not unchecked at the runtime boundary.

The new registry reads `resolvePluginCatalog(..., includeDisabled=true)` and metadata/contained file inventories only. It lists installed disabled/ambiguous rows and separately overlays saved missing identities. Runtime/assets checks read bounded declared inventories/receipts; actual compatibility is confirmed at explicit Start. Catalog or source changes invalidate new preparation; active runs keep their content-pinned snapshot. Do not re-import changed code in a running worker; the next run must select current checked content.

Contain entry points and declared resources to the owning selected plugin or its explicitly activated owner-bound runtime. Reject traversal, links/junctions, unsafe hard links, ambiguous sources, duplicate IDs and changed digests. Installed code is trusted: containment and IPC checks are not a sandbox or redistribution approval. No new plugin type or input provider is needed. No test stage is placed in production plugin folders.

### 2. Extend one global profile and keep saved versus active state distinct

Retain file `{version:1, scope, provider, offsetMm, sizeFactor, appearance, ...unknown}` and add optional:

```text
processing: {
  version: 1,
  stages: [
    { owner, id, enabled, slot, implementationVersion, contentDigest,
      settingsVersion, settings, failureMode: "stop" | "bypass" }
  ]
}
```

Order is array order within fixed slots; disabled entries retain order/settings. `failureMode:bypass` is valid only for skeleton stages declaring support and explicit user consent. Geometry always fails open visibly. Bind settings/schema/content identity so an update requires explicit review; no executable migration on discovery. Preserve unknown/uninstalled data in the raw record, but refuse execution of unsupported enabled entries. Do not reinterpret new settings under an old schema. Missing `processing` means empty without writes.

Raise the common disk cap deliberately to 128 KiB and the version-2 profile/control cap to 96 KiB; keep individual settings/entry caps so the limits are achievable. Bound HTTP/native reads before allocation and use the same limits in panel, SDK and nonthrowing host parsers. Existing 8 KiB version-1 adjustment controls retain their previous bound. Oversized/invalid/foreign/linked records remain untouched. Extend PR #50's shared transaction rather than another writer: source Save changes only provider, adjustment Apply only its fields, pipeline Save only processing; nested unknowns survive. Pipeline Save takes file and registry revisions and shares preparation exclusion. Infer/pin a first provider only under the existing first-save rules, never a synthetic fallback.

Portable v1 remains adjustment-only for empty pipelines. Portable v2 contains validated adjustments plus the complete required pipeline descriptor; file scope, runtime machine paths and credentials are absent. Update all parsers instead of relying on unknown-field preservation. Version-2 metadata is explicitly required, not a hint an old SDK can ignore. Native managed launch uses a runtime-capability handshake: no hands are released to the consuming page until the SDK acknowledges the exact required pipeline contract. Old bundles receive rebuild guidance; merely sending a socket message is not success.

Pin an **active pipeline snapshot** at launch: source, ordered code/settings identities, effective processing hash and runtime endpoints. Saved pipeline edits do not change this snapshot. Adjustment Apply reuses PR #50's runId/monotonic sequence/revision/ack, combining new adjustments with the active pipeline, not the pending next-session pipeline. Distinguish file revision (conflict check), delivery sequence (ordering), and effective processing/geometry revision (cache validity). A source-only save or appearance-only change must not unnecessarily reset interaction. A true geometry adjustment resets input, processor state and caches at a frame boundary before acknowledgement. Pipeline replacement occurs only after Stop/relaunch; no unsaved picker or pipeline draft is committed by Apply.

Alternative rejected: hot import on every toggle or persist in each plugin's config. Both create ambiguous ownership/revisions and unsafe mid-grab transitions.

### 3. SDK owns order, immutable inputs and admission

```text
immutable published hand21 + source/clock admission
  -> skeleton stages in saved order
  -> PR #50 prepareHandFrame size/offset, once
  -> HandInput.push and existing filtering/gesture state
  -> HandInput.sample at requested display time
  -> unchanged scene mapping, interaction and pointer
  -> geometry dispatch from that final canonical sampled pose (nonblocking)
  -> validated current geometry + common mapping/appearance -> standard drawing
```

Refactor ingress to accept asynchronous completion without changing the immediate identity path. With no enabled stages, return the original frame and use the existing transform/push/sample path, without an extra clone, microtask, worker, queue or numeric normalization. Identity means identical to the configured adjustment-only baseline; bit-identical to provider bytes additionally requires identity adjustments. Test both rather than promise that nonzero offsets leave bytes unchanged.

Active stages receive owned, immutable envelopes: contract/layout, metres/panel axes, source owner, runId/session epoch, pipeline and geometry revision, frame sequence, original capture time/domain, mapped page capture time and uncertainty, stage dispatch/deadline time, handedness/hand ID, 21 XYZ points, validity and labelled scores/capabilities/native fields/provenance. Geometry gets a distinct `poseSequence` and requested sample time, with scores from the last source snapshot labelled as such; `Hand` is not cast to `WireHand`. Reject unknown clock mapping and clock resets by fencing/reset, not by relabelling capture time as completion time.

A result echoes exact association and supplies bounded status/metrics plus either a replacement hand21 skeleton or declared enrichments. Skeleton output preserves source sequence/time and IDs, not a fabricated new capture. Stage signal policy is mandatory: `coherent-native` returns all required corresponding optional fields/capabilities, or `derive` explicitly clears the relevant native capabilities and keeps original values only in provenance. Since existing capabilities are frame-wide, v1 requires a consistent signal policy across the full result frame; no accidental per-hand mixture. Explain the declared derived policy in the row. Do not change existing native-pinch/native-grab defaults outside an enabled stage's explicit policy.

Production `worker` execution uses an app-process Web Worker, loaded only on an explicit prepared run; it performs no work in native capture callbacks or synchronous render hooks. The test harness also injects a direct in-process adapter for deterministic order/identity tests; it is not a production synchronous processor loader. Heavy native/accelerated runtimes use sidecars. The SDK owns the same ordering for either adapter, not two filtering pipelines.

### 4. Queues, numerical budgets and failure

Per stage, one in-flight request plus one replaceable newest pending snapshot; topology/settings handshakes are separately bounded control messages. Also bound admission for the whole skeleton chain to one active frame and one newest pending frame so multiple stages cannot accumulate a hidden FIFO. Never complete an older frame after a newer accepted one. A timer can declare failure without awaiting stuck code; terminate/fence its worker or sidecar and never accept a late reply.

Initial enforceable defaults and engineering targets (not measured promises):

| Boundary | Policy |
| --- | --- |
| Core synchronous validation/copy/dispatch | Target under 1 ms/frame; report measured overhead, never run model work here. |
| Skeleton chain | Sum declared budgets must be at most 8 ms. A frame deadline is admission time + admitted total budget, including worker/IPC waits; each stage gets only remaining time. A missed deadline triggers the skeleton failure policy, not an arbitrary frame-drop that leaves a grab coasting. |
| Geometry request | Deadline at most one 60 Hz frame (16.7 ms) after sample dispatch; measured P50/P95/output age/drop counters are diagnostics, not proof of fitting speed. |
| Geometry display | Age no more than 33 ms on the mapped page clock and within a conservative 10 mm maximum keypoint displacement from the input pose. Same epoch, effective revisions, hand identity and topology required. |
| Lifecycle | Ready within 10 s, heartbeat every 500 ms with a 2 s watchdog, stop acknowledgement/exit within 2 s before owned-process termination. No automatic crash restart. |

A skeleton failure first blocks admission and calls the existing PR #50 empty-hand release/pointer-reset/filter-reset path; no synthetic click or next raw frame. Default is stopped processing session with explicit Retry/Disable guidance. Opted-in supported bypass resets the entire downstream state and resumes the same source under a new epoch, marking the stage Bypassed prominently. Do not select another source or silently change geometry during a hold.

Geometry failure, missing readiness after explicit launch, invalid output or lateness removes only optional geometry, retains the skeleton and marks the row Failed/Over budget/Bypassed as applicable. Known unsupported context/missing enabled declaration fails preflight even for geometry: fail-open is a runtime policy, not permission to silently drop a configured stage. A readiness failure may allow a managed native geometry-only run to continue visibly degraded after its supported adapter was attempted; it must not masquerade as Running. Retry is explicit and creates a new execution epoch.

An explicit empty source frame immediately cancels geometry and its pending work, even though ordinary `HandInput` may retain coasting skeletons. Hand loss/ID reuse uses an epoch-local hand incarnation, not numeric ID alone. Stop, profile geometry change, navigation consumer replacement, clock reset and disposal invalidate all outstanding requests and cached topologies as appropriate. Preserve true source capture age through async processing; the 8 ms budget does not make an already-old source fresh.

Alternative rejected: await mesh in the render loop, unbounded FIFO or re-date stale results. Each creates interaction latency or plausible-looking stale hands.

### 5. Common geometry API and visual lifecycle

Introduce read-only `HandGeometry` and an optional `xrb.handGeometry` accessor (current valid records keyed by epoch, hand incarnation and pose sequence), with no provider or concrete processor names. It includes standard mesh schema version, topology ID/version, immutable indices and dynamic vertex positions, optional normals, provenance and input/output timing. Keep `currentHands`, `sceneHands`, gestures and their 21-point indexing unchanged. Access returns no geometry after invalidation; old async results cannot repopulate it.

V1 supports at most two hands, 16,384 vertices and 32,768 triangles per hand, finite float32 positions/normals, uint32 indices within vertex bounds, and 2 MiB per binary message. Negotiate topology once per epoch/content/LOD and cache at most one active topology per hand/channel; changes invalidate old geometry before replacement. Validate counts/byte lengths before allocating. A topology is indexed by a content digest, never just a plugin-chosen label. Unknown enrichments are bounded and namespaced; no arbitrary executable draw callback or automatic asset URL fetch.

At each standard draw, dispatch an owned copy of the already-sampled canonical pose without waiting. Draw only a fresh accepted mesh whose saved input pose remains within the age/displacement bounds; otherwise draw the ordinary skeleton and report age/drop reason. Do not interpolate a stale mesh onto unrelated predicted joints or apply offset/size twice. Retain source-sample association even when a result from a previous render sample is still within tolerance. Empty/no-hand snapshots always win over late geometry.

Add a standard mesh child to the existing common visual root so `handVisual:false` continues to suppress the entire standard visual attachment. Convert mesh vertices through the same panel mapping as skeletons. Use PR #50's `boneColorLinear` and `opacity` as the surface color/opacity in v1; no private shader/material settings or second appearance profile. `showJoints`, `showBones` and indicator controls govern their existing drawing layers independently, alongside any mesh. A failed/hidden mesh does not disable ordinary configured layers or change contacts. Reuse bounded vertex buffers; dispose topology, materials and buffers on replacement/disposal. Geometry-only updates must produce identical interaction traces to skeleton-only runs.

This contract accommodates a future external fitted-surface plugin with a different internal rig, cached topology, shape/LOD and fit residual. Such a plugin maps back to hand21 if it ever claims skeleton output; an internal rig is optional namespaced geometry, never a replacement core landmark array. No concrete model, vendor name or runtime branch enters core.

### 6. Native managed sidecar protocol and supervisor

Create a neutral panel/run supervisor plus an authenticated per-run loopback WebSocket broker. The SDK dispatches stages through it; the broker supervises/routes validated messages but does not transform, smooth or sample hands. Keep control descriptors separate from portable profile data. Deliver a token-scoped runtime descriptor through the existing authenticated host channel, retained for trusted same-run navigation. Validate exact app/dev origins and role-bound credentials, loopback peer address, payload limits and run/source/content identity; no wildcard CORS or credential-bearing logs/URLs in exported output.

Start only after explicit launch preparation revalidates metadata/content and settings. Spawn a checked contained program directly with a bounded argument array, never a shell string or ambient PATH resolver. Pass bootstrap endpoint/run/role token over an inherited private pipe, not command-line arguments or inherited global runtime activation settings. Per-run user-owned working/cache directories are not installed plugin source. Do not create an environment, install a package, fetch weights or open a camera here. The plugin supplies an already provisioned runtime.

Protocol version 1:

| Message | Direction and meaning |
| --- | --- |
| `start` | Supervisor to child via private bootstrap: run/epoch, selected stage/content identity, protocol/schema, validated settings, limits, endpoint and child-role credential. |
| `ready` | Authenticated child to broker: matching identity, accepted schemas/settings/content, optional topology inventory and negotiated limits; no implied hardware accuracy. |
| `frame` | SDK via broker to stage: immutable bounded binary envelope + packed hand data, capture/sample association and remaining deadline. No camera images. |
| `result` | Stage via broker to SDK: echoed request identity, status/metrics and validated binary output; immutable topology sent once by versioned control message. |
| `reset` | Owner cancels outstanding epoch, clears pending/state/cache and requests acknowledgement before new epoch input. |
| `stop` / `stopped` | Stop acceptance, retire epoch, clear work, request disposal, then await process exit. |
| `heartbeat` / `crash` | Watchdog/liveness and classified process/protocol failure; update status and apply slot failure policy, never report successful processing from heartbeat alone. |

Use a bounded binary header containing control length and payload length, then bounded JSON association/control and packed numeric buffers; never per-vertex JSON. Reject unknown required message/schema versions, oversize/length mismatch, duplicate/foreign request IDs, wrong clock domains and unexpected topology versions before forwarding or allocating. Tokens are role-scoped: child cannot impersonate an app or change saved settings; renderer cannot start arbitrary processes. One stage connection per instance and one active SDK processing consumer per managed run. Preserve the process across trusted same-run navigation only with an exclusive consumer-generation transfer/reset; revoke the old consumer first, with bounded reconnect grace, not two competing dispatchers.

Run startup gates required skeleton processing on sidecar ready plus SDK capability/application acknowledgement. Optional geometry failure follows visible fail-open; no enabled stage is silently omitted. Own sidecar lifetime through launch failure, Stop, host error/exit, dev failure, SDK disposal/disconnect, navigation timeout and panel shutdown. Do not let a tab itself become the unfenced lifetime owner. On stop, cancel/retire then drain/terminate only owned children, and confirm exit before declaring cleanup complete. A crash/timeout disables the instance until explicit Retry/new run.

For Windows, use a small neutral Job Object launcher with kill-on-owner-close and child assignment before execution to prevent orphan process trees on panel death; the private pipe/heartbeat also makes the stage exit on owner loss. This helper supervises processors only and must never forcibly terminate the display host as a processor cleanup shortcut. Failure to establish containment blocks launch. Test real child crashes and supervisor death with the inert executable/script; do not infer lifecycle acceptance solely from mocked exit events. No offline-package lifecycle owner is implemented here.

### 7. Context and deployment refusal

Stage declarations may describe future contexts, but v1 execution adapters authorize only implemented `managed-native` support. Registry availability is not executable support. Add one pipeline preflight shared by native built/dev launch, browser preview/dev, both publication paths and every packager before output generation/staging. Recheck on direct server/API entry points, not just disabled UI buttons.

An app that actually consumes Hand with enabled stages must have a checked lifecycle owner and SDK contract support. Browser preview, publication and offline host/headset packages initially refuse any enabled stage with a clear stage/context reason and explicit Disable in Hands guidance. Even a locally installed sidecar cannot run inside a deployed web page. Do not copy processor programs, environments, model assets, tokens or machine paths into a portable package. Disabled/empty pipelines follow PR #50's frozen adjustment-only snapshots. Apps without Hand start no stage and are not blocked by unrelated enabled stages.

Future deployment support requires its own explicit asset/runtime inventory, rights review and standalone supervisor; it cannot be claimed by setting a metadata context flag. Existing old offline packages remain unchanged. An old build is not upgraded by changing the author's live profile.

### 8. Self-contained Post-processing component

Create `packages/control-panel/ui/hands-postprocessing.js` exporting `mountHandsPostprocessing(root, {load, save, subscribe}) -> {refresh, dispose}`. Root-scoped IDs, validation, drafts, request cancellation and subscriptions; no dependency on source/adjustment form markup, global selectors or page placement. Return loaded profile revision/registry revision, saved pipeline, installed rows and run status as one snapshot. Save sends only the processing draft, both revisions and explicit bypass selection to a dedicated authenticated local mutation endpoint; it never sends source or adjustment drafts.

Mount in `<div id="hands-postprocessing"></div>` in the Hands options stack, immediately after Source and before Position and size. The concurrent page-layout change owns that container's final placement; the same component may be remounted there unchanged. If the shell has not landed, add only that isolated container beside the existing cards. Do not rewrite the page or the adjustment component.

Use existing design-system fields, dropdowns, switches, number steppers, disclosures, buttons and live/help/error regions. Group Skeleton refinement / Geometry enrichment, saved Move up/down within each group, installed enable switches, schema settings, readiness reason and runtime status. Show explicit derived-signal and stop/bypass help for skeleton stages. Save pipeline says Applies on next session; in-run adjustments stay independently Apply. Disabled rows do not start anything. No installed or saved rows: one sentence, "No post-processing plugins installed; plugins can add skeleton refinement and hand meshes." An ordinary Plugins link may follow it.

Statuses: Not enabled, Unavailable (with missing/runtime/assets/schema/context reason), Ready, Starting, Running, Over budget, Bypassed, Failed and Stopped. Source status is separate. Report saved configuration versus the active pinned snapshot and measured processing/output age/drops when available. Runtime metrics cannot overwrite newer epochs. Retry targets the current failed instance/run with normal ownership/ack checks; Save alone does not retry or start it. Preserve dirty drafts on source saves, adjustment Apply and plugin/status refresh; conflicts require Reload/review.

### 9. Delivery order and reviewability cut

Full-scope outcome order, mirrored by tasks and PR checkboxes:

1. Metadata-only declaration/registry with content/owner/context validation.
2. Global profile persistence, portable versioning and saved/active snapshot separation.
3. Ordered bounded SDK skeleton/geometry slots and safe failure/reset semantics.
4. Managed native sidecar protocol, supervisor and required-consumer readiness.
5. Common geometry accessor and standard appearance-aware mesh visual.
6. Shared context refusal across launches, previews, publication and packages.
7. Independent Post-processing section plus neutral contract documentation and integrated inert-fixture coverage.

If the full scope is too large, recommended separately approved PR sequence:

- **A: configuration foundation** — outcomes 1/2, early refusal guards from 6, and the independent configuration UI from 7. All enabled execution explicitly unavailable until the runtime arrives; rows never say Running. No sidecar/native helper/mesh implementation and no live pipeline Apply. This is a useful review of the durable contract without pretending to meet the full runtime request.
- **B: SDK semantics and optional geometry** — outcome 3/5 and fake in-process adapter tests; retain refusal outside explicitly supported adapters. No real processor shipped.
- **C: managed native execution** — outcome 4, complete 6/7, actual inert sidecar lifecycle, authenticated native hand gate and final integration coverage. Only this slice can claim the whole request works.

Do not silently turn this full-scope plan into A or mark later outcomes complete. A split changes PR outcomes and requires approval. Native capture, real processors, runtime/model installation, live Hands provider sessions, distributed/offline processing, arbitrary app rendering and benchmark/recording tools are excluded from all three.

## Risks / Trade-offs

- [Profile work moves while this plan is pending] -> depend on PR #50 landing; recheck its exact DTO/limits/ack/transaction seams before implementation and update only this change's integration points.
- [Async skeleton changes gestures or leaves holds alive] -> deadline is safety failure, ordered admission, existing empty-hand release and no-click pointer reset, explicit-only bypass; compare event traces.
- [Mesh lags predicted hands] -> post-sample inputs, sample identity, 33 ms/10 mm freshness limits and visible skeleton fallback; do not promise alignment or speed from upstream claims.
- [Required settings silently ignored by older bundles] -> portable version bump, host/SDK feature gate and acknowledgement before input, explicit rebuild guidance.
- [Discovery accidentally executes ordinary plugin services] -> dedicated catalog/metadata path, import traps and process/download-denied tests.
- [Process isolation mistaken for sandbox] -> document trusted installed code, authenticate peers and check content; do not grant arbitrary download/exec/install from settings.
- [Windows orphan cleanup or native startup gate is not tested by ordinary ready-PR CI] -> targeted compiled helper/host controls and real inert-process tests on Windows; report the actual lane separately, never a skipped lane as success.
- [UI conflict with parallel page work] -> root-only mount API and fixed insertion contract; no layout or source/adjustment-control rewrite.

## Migration Plan

1. After approval, integrate the landed adjustment profile/delivery contract without rewriting its transform or user state. Old source-only/adjustment-only records read as an empty pipeline without writes.
2. Add declarations/state/runtime behind explicit enablement, preserve unknown and missing stage settings. No real processor exists in product defaults.
3. Rebuild SDK-consuming apps normally. Required pipeline metadata and capability gate block old consumers rather than leak raw hands. Empty pipelines remain the exact existing path.
4. Rollback must stop managed runs first. Old profile writers preserve unknown pipeline data, but old binaries may not enforce it: do not advertise downgraded builds as safely processing enabled stages; explicitly disable with the new writer or retain the new runtime. Do not delete a profile as rollback.

## Validation plan

Planning checks: strict OpenSpec, PR body format, names and whitespace only. Implementation uses isolated state/projects/processes and proof output under the task-owned scratch folder, never the user's panel/profile/projects. No camera, tracking runtime, hardware or model download. All started servers/children/browser sessions stop before reporting.

- Registry/profile: inert import traps, zero process/download/navigation writes; both origins/conflicts/disabled/missing rows; containment/link/unsupported schema; bounded settings; content update; unknown preservation; source/Apply/pipeline competing writers; required portable DTO round trip and old-client refusal.
- Pipeline: no-stage same-object/bit checks including negative zero/optional native fields and exact adjustment-only baseline; native/browser fixtures; source and frame immutability; order, signal policy, once-only adjustment, sample-vs-capture identity, deadlines/queue occupancy/drop counts using a virtual clock; wrong epoch/revision/ID/topology/malformed floats and disposal.
- Safety: required skeleton timeout/crash during a hold produces release without click and no raw leak; explicit bypass resets and stays visible; optional geometry crash/staleness/no-detection preserves skeleton interaction and hides mesh immediately; appearance-only Apply does not cancel interaction.
- Sidecar: test-only in-process fixture and actual isolated local child speaking the same protocol; auth/origin rejection, bootstrap/ready/start timeout, one in-flight/newest pending, reset, crash, stop, navigation transfer, host launch rollback and supervisor death/owned tree cleanup. Fake runtime only; no Python/GPU/device dependency.
- Geometry: small inert triangle/topology under tests only; both hands, finite/bounds/index/resource rejection, optional accessor validity, common mapping, color/opacity, visual opt-out, topology/resource disposal and identical geometry-only interaction traces.
- Context closure: direct native/browser/dev/Launcher/API preparation, both publication branches and all packagers; enabled unsupported stages refuse before output and credentials never enter artifacts; disabled and Hand-off cases preserve prior behavior.
- UI: isolated actual component/browser fixtures for switches, fixed-slot order, every setting field, status versus readiness, explicit bypass, saved/active distinction, dirty conflicts/disposal and one-sentence empty state. Capture light/dark/narrow component proofs after implementation only. Test the component independently of the concurrent layout.
