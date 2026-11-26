# Design

## Context

This revision supersedes the original two-slot design, following the person's scope reduction. See proposal.md for intent. Baseline PR #48 supplies the common ingress; merged PR #50 supplies global adjustments/profile writes, reused rather than duplicated. The component is now mounted in the dedicated slot supplied by merged PR #51.

`index.ts` samples `HandInput` before standard drawing: that sampled/predicted canonical pose, after size/offset/filtering, is the mesh input. `Hand` is not `WireHand` and has no fresh sensor confidence. `hand-source.ts`, provider binaries, native hand layout and interaction remain unchanged. Existing skeleton grace must not keep a stale mesh alive after an explicit no-hand frame.

## Goals / Non-Goals

**Goal:** one optional desktop mesh sidecar plus one global selector, with unchanged interaction and no app edits.

**Excluded:** skeleton refinement, stage lists/order/dependencies, bypass policies, a worker/in-process processor adapter, live processor settings delivery, required-profile versions or input readiness gates, browser/deployment execution or refusal, concrete processors/assets and Hands-page redesign.

## Decisions

### 1. Small declaration and global selection

Add one optional `handMesh` declaration per `xrb-plugin.json`: version 1, local ID, label, contained sidecar program/argument array, settings schema version and at most eight existing boolean/number/select setting fields. The origin-qualified owner comes from `extension-catalog.ts`; reuse enabled/source-conflict and containment checks. Discovery reads metadata and file existence only: no imports, process launch, installation or download. This is trusted installed code, not a sandbox.

Extend the existing workspace-global profile with `postprocessing: {version:1, selected:null | {owner,id}, settings:{...}}`. Retain each plugin's schema-versioned values when another is selected; at most one is active. Missing field means None without creating a file. Keep existing profile bounds/lock/revision/atomic write and unknown-field preservation; bound this new section to 8 KiB and each plugin's settings to 2 KiB, refusing an oversized explicit Save rather than increasing control limits. Save only this section, with file/catalog revision checks; source and adjustment drafts are independent. Missing saved selection remains visible, never silently replaced.

Selector/settings Save applies on the next desktop run, including None. No hot switch, live processor configuration or new acknowledgement transaction. PR #50's adjustment-only portable DTO remains unchanged: optional mesh runtime information travels separately, only for a managed desktop run. Do not stamp plugin selection, credentials or runtime paths into preview/published/package output.

### 2. One optional desktop-run sidecar

On a panel-managed native built/dev run using Hand, pin the selected plugin/settings and start its already installed program directly, without a shell or implicit runtime/model setup. The host run owns cleanup; source acquisition starts normally and never waits for mesh readiness. A missing/disabled/conflicting plugin, bad settings, startup failure or old SDK consumer keeps the skeleton running with an explicit mesh-unavailable/rebuild status, not a failed app launch.

Use a run-scoped authenticated loopback endpoint and a private bootstrap pipe; deliver the optional endpoint/token to the SDK through managed native runtime metadata, separately from adjustment profiles. Check origin, role/run token, contained executable and bounded payloads. Never place credentials in public output or logs. One active SDK consumer dispatches per run; page replacement revokes the old consumer epoch. No capture callback or render-thread model work.

Version-1 protocol is only `start` (bootstrap/settings), `ready`, `frame`, `result`, `stop` and classified crash/exit status. Frame/result association includes run/consumer epoch, hand identity, pose sequence, geometry revision, dispatch time and requested sample time. Input is an owned copy of up to two final 21-point skeletons in panel metres with handedness; no native gesture rewriting, invented confidence or camera images. Output is mesh positions, optional normals and versioned indexed topology, never replacement joints or executable drawing callbacks. Cache topology once per ID/version per run.

Use bounded binary numeric buffers plus a small validated control header: maximum 2 MiB/message, 16,384 vertices and 32,768 triangles per hand, finite coordinates and in-range indices checked before use/allocation. Keep only one frame in flight and one replaceable newest pending frame. A result older than 33 ms from dispatch, from an old epoch/revision/hand, or over 10 mm maximum landmark displacement from the current pose is discarded; the app never waits for a result. These are conservative fallback limits, not measured model performance claims.

Ready timeout is 10 s; stop gets 2 s before terminating only owned processes. Stop/run failure, host exit, page disposal and panel shutdown retire credentials, clear pending mesh and stop the child. The sidecar contract requires exit on bootstrap/control-pipe closure or owner watchdog expiry so panel death cannot leave it running; test actual parent/child death, not just mocked events. No new generic native job launcher is planned. No automatic crash-restart loop; a new app run retries with the saved selection.

### 3. Draw mesh without touching input

After existing final pose sampling, copy/dispatch pose data without awaiting it; the interaction/pointer/filter path executes exactly as before. Geometry adjustment changes invalidate cached/in-flight mesh via an epoch/revision fence; appearance Apply updates drawing only. Plugin settings remain pinned until the next run. None starts no sidecar and performs no pose-copy work.

Standard SDK hand drawing consumes the validated current mesh using the same panel-to-scene mapping, without applying offset/size a second time. Use the existing global bone color and opacity for the mesh; joint/bone/indicator appearance controls keep their current independent meaning. `handVisual:false` suppresses all standard skeleton/mesh attachment without disabling input. No new public geometry-extension API is needed for this minimum.

Missing, starting, late, malformed or failed geometry uses the plain skeleton immediately and reports the reason in mesh status independently of source status. Empty/no-detection frames, hand loss/ID reuse, disposal or retired epochs invalidate mesh immediately, even during skeleton grace. Reuse bounded buffers and dispose them on topology replacement/stop. Compare input bits and gesture/interaction event traces with None, healthy, late and crashed mesh processing: they must match.

Browser previews, published web builds and offline packages simply do not receive a mesh runtime descriptor and continue existing skeleton behavior; do not reject their launch/build or require changing the global selection. Direct unmanaged launches also remain skeleton-only. Existing ordinary provider/context errors are unaffected.

### 4. Selector component and proof

Create root-scoped `hands-postprocessing.js` with mount/refresh/dispose callbacks, placed after Source and before Position and size by the concurrent Hands-page layout. It contains one selector (None or installed plugin), the selected plugin's few schema-rendered settings, Save, and status beneath it. Keep missing saved identity as an unavailable row. Use existing shared controls; no stage switches, ordering UI or page redesign.

Say "Applies on next desktop run" and show one context notice: "Post-processing is used only in desktop apps run from this panel, not browser previews, published web builds or offline packages." Empty state: "No post-processing plugins installed." Status distinguishes None, Not started, Starting, Running and Skeleton fallback with reason; no hardware or execution claims from discovery. Preserve local drafts on unrelated source/adjustment saves and show revision conflicts normally.

Use exactly one fake sidecar plugin under tests: it returns a tiny mesh and can delay, crash or return malformed/old-epoch replies. Exercise discovery/persistence, real isolated child start/stop/owner death, bounded pending frames, standard drawing/appearance/opt-out, unchanged interaction, missing selection, next-run Save and skeleton-only excluded contexts. No real processor or model is shipped. All state/output and child processes are task-owned; no user panel/profile/projects or hardware are used.

## Risks / Trade-offs

- [Async mesh can lag] -> strict freshness/pose association and visible skeleton fallback, never delayed interaction.
- [Concurrent profile/page work moves] -> reuse the landed writer and adjustments, keep runtime metadata separate and mount only the independent component.
- [Old bundles cannot draw mesh] -> show rebuild guidance and keep skeleton input; no required-feature gate.
- [Processor fails or outlives its owner] -> bounded lifecycle, pipe/watchdog owner-loss contract and actual fake-child death tests.

## Migration Plan

Old profiles read as None without writes. Ship the neutral mechanism with no production processor; a real plugin follows separately after feasibility. Existing apps need only a normal SDK rebuild for standard mesh drawing. Reverting this optional feature preserves unknown profile data and leaves ordinary skeleton input intact; stop owned sidecars before downgrade. Delivery order: declaration/profile, sidecar, SDK drawing, selector/integration, with tests/docs alongside each.
