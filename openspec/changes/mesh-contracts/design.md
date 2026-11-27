# Design

## Context

See `proposal.md` for motivation and scope. The task branch was an untouched old snapshot; it was fast-forwarded to default head `ca272cbaca63d473ed4cb5d01ba0270cdc62a848` before planning. Inspection confirms:

- `sdk/src/hands.ts` validates `WireHand.scores` but drops them from Track/Hand; `lastSeen` and mapped `captureTime` exist. `hand-source.ts` preserves raw scores through adjustments. No provider ABI change is needed.
- `hand-mesh-protocol.ts`/client carry only final positions and pose epoch/sequence/revision. The existing client's `generation` is geometry-profile invalidation, not a settings acknowledgement.
- `hand-mesh-run.ts` spawns directly, has a fixed ten-second ready timer, one executing/newest pending frame, a 33-ms freshness fence and cooperative EOF plus direct-child termination. It has no OS-owned descendant containment.
- `hand-mesh-plugins.ts` resolves only source-contained programs. `service-artifacts.ts` demonstrates checked writable generations, but its embedded Node-specific setup is not a generic processor runtime resolver.
- `panel.ts` owns one managed desktop mesh run and persists post-processing independently. Save does not update the run. Existing Hands UI says next-run-only; the standalone Hands provider session and viewport do not own a mesh service.
- Standard `HandVisual` already stores skeleton visibility separately and `HandMeshVisual` uses bone color/opacity. Preserve that separation and remove any coupling found at dispatch/drawing boundaries; do not introduce automatic skeleton hiding as a mesh fallback or replacement policy.
- `native/provider-session/supervise.cpp` demonstrates process-birth job assignment and exact-handle ownership, but its line protocol and provider-specific lifecycle must not be reused blindly for binary mesh packets.

## Goals / Non-Goals

**Goals:** A reusable run-owned geometry service/control boundary; explicit observation provenance; versioned live configuration with end-to-end generation association; useful bounded preparation; process-tree ownership independent of worker cooperation; receipt-checked writable runtime lookup; legacy compatibility.

**Non-Goals:** Installing a processor/runtime/model, adding new settings widgets/sliders/reset menus, attaching mesh to Hands acquisition/viewport, changing the source-provider ABI/lease, benchmarking a real processor, physical-camera tests, browser/WebXR or packaged mesh execution. No edits or test writes to the person's profile, workspace, other checkout or running services. Later Hands integration consumes these APIs rather than inventing another control protocol.

## Decisions

### 1. Carry observation metadata beside, never into, interaction geometry

Add optional observation metadata to SDK Hand and internal Track state, copied from accepted acquisition data. Each of 21 joints retains the latest provider confidence, an explicit supported/unsupported/unknown value, and last trustworthy supported capture time. In the existing confidence-bearing path, score greater than zero denotes observation support; the score is not relabelled a calibrated probability. A zero score is preserved and does not refresh that joint's supported observation timestamp. Unknown/custom inputs retain null evidence, not score one or age zero.

The modern mesh frame carries aligned confidence/support/age arrays, with age measured as nonnegative `sampleMs - lastSupportedCapturePageMs`; absent mapped capture history is null. Document that this includes the requested prediction horizon, and keep dispatch freshness (`sentMs`) separate. Preserve current score validation, pose filtering, prediction and gestures exactly; metadata cannot gate interaction or feed a second transform. Reset evidence with retired track/ingress identity, not just numeric ID. Do not infer hidden observations from fit residuals or smoothed positions.

Alternative rejected: changing native ABI/HANDS packets or using `sentMs` as capture age. Acquisition already has the needed evidence, and dispatch time would make stale predictions look observed.

### 2. Negotiate independent peer capabilities, keeping a real v1 path

Add a declaration version supporting a small capability set (final observations, configuration generations, preparation progress) and per-setting `changeMode: live | reprepare`. New declarations opt into the modern start/ready contract; legacy declarations keep the existing start packet exactly. A processor's ready/capability response must match the declared protocol; do not optimistically send modern messages to a legacy child.

Retain the existing run-only `{version:1,url,token}` bootstrap envelope for old hosts/SDKs. A modern SDK offers supported protocol/capabilities at authenticated connect and receives the selected protocol plus current state. Absence of an offer identifies a legacy consumer; its response and frame/result shape stay v1. A new service explicitly adapts to v1 peers and does not fabricate observation or configuration evidence. New processors declaring observations required cannot process consumers lacking them: report rebuild/fallback rather than forge data. Unsupported future major versions are unavailable, not guessed.

Compatibility matrix for focused tests:

| Declaration/processor | Consumer | Behavior |
| --- | --- | --- |
| Legacy | Legacy or modern | Existing launch-pinned v1 mesh; live changes report unsupported/relaunch |
| Modern | Modern | Negotiated observations, configure, progress and generation fences |
| Modern | Legacy | Only explicitly supported v1 subset at launch; required missing capabilities give skeleton/rebuild guidance |
| Unknown/inconsistent | Any | Visible mesh failure; input continues |

Alternative rejected: replace the provider ABI, require every SDK bundle to upgrade at once, or treat successful writes as capability/application proof.

### 3. One stable run gateway, replaceable contained processor and ordered settings

Separate the run-owned authenticated gateway from the child stage so settings, None and selected-plugin replacement can be reconciled without restarting acquisition or changing the descriptor. Allocate the run-only gateway descriptor for managed native Hand launches even when None is selected; this starts no processor, but lets a modern SDK negotiate once and later enable a saved selection without app restart. A committed post-processing save schedules reconciliation for the existing compatible managed native consumer only. It never starts an idle run or provider. Keep the existing profile revision/catalog validation and common write lock; configuration delivery is asynchronous after persistence and cannot turn a successful save into a false persistence error.

The control API snapshots `{runId, owner, id, settingsVersion, generation, savedRevision, values, mode}`. Service-owned strictly increasing generations are independent of content hashes and SDK geometry revisions. Maintain one applying transaction and one replaceable newest pending transaction; duplicate identical desired state is idempotent. Validate values and the active identity before writing a bounded configure packet. Any changed setting marked reprepare makes that transaction a reprepare. Applied ACK must echo the exact run/plugin/generation/schema and sanitized values; stale, duplicate or unrequested ACKs cannot advance state. ACK deadlines are bounded; failure is saved-but-not-applied with a reason and explicit retry, not an automatic restart loop.

On any newer desired generation immediately fence incompatible displayed/cached geometry. Frames/results carry the negotiated configuration generation; both service and SDK reject retired results, even when epoch/pose revision and topology IDs match. SDK clears incompatible pending/accepted output and topology on a generation transition. Drawing ACK refers only to a generation actually returned for drawing at a renderer frame boundary; no-hands or disabled visuals do not claim drawing. Expose desired/requested/applied/drawing facts separately. Preserve skeleton filters, grabs, pointer and acquisition across mesh-only changes.

Selecting None clears mesh immediately and drains the old stage. Selecting another plugin drains the old contained tree before starting the new stage; if teardown cannot be verified, replacement stays blocked, but skeleton continues. Stop/retired run always wins over in-flight reconcile/ACK. Legacy consumers/processors retain their supported launch settings with clear next-run guidance; no false live claim. The existing selector's minimal context/status copy must be made accurate, but its Save controls and layout are not redesigned in this stage. The later UI can invoke the same save/control boundary; later Hands session wiring supplies its own explicit owner.

Alternative rejected: a FIFO of quality/device loads, changing the native host channel, issuing a second provider start from Hands edits, or reusing ordinary adjustment acknowledgements for mesh application.

### 4. Preparation is a bounded asynchronous state, not early Ready

Modern declarations provide `preparationTimeoutMs`, a finite integer from 1,000 through 120,000 ms; the modern default is 30,000 ms and legacy v1 retains its supported ten-second behavior. Each startup/reprepare gets one hard deadline; validated progress cannot extend it. The app-attachment allowance remains thirty seconds after owning app startup; preparation does not delay the SDK's connect/status exchange. The independent unattached-startup cap is `max(90,000, preparationTimeoutMs + 60,000)` ms, never more than 180 seconds, so declared preparation cannot outlive cleanup indefinitely or be cut short by the old ninety-second timer. Consumer heartbeats/status must still work while Preparing; missing-consumer cleanup is distinct from processing readiness.

Expose structured `Preparing`, `Ready`, `Failed` and `Stopped` states with bounded optional progress, phase and safe reason. Sanitize/control-length-limit plugin messages; never forward raw stderr, paths or model text. Require ready/applied to identify the prepared generation. Suspend frame dispatch and retire incompatible output during preparation, not skeleton sampling. Reprepare may rebuild plugin state or, when necessary, replace its contained process behind the same gateway; neither restarts the owning input session. Live changes use an independent bounded ACK wait, not the two-second frame watchdog; active frame watchdog/freshness stays unchanged when Ready. Explicit preparation/configure failure clears mesh and ends or drains the unusable stage.

Alternative rejected: merely lengthen a hidden fixed timer, extend indefinitely on progress, emit Ready before loading, or let cold initialization hit the per-frame watchdog.

### 5. Enforce process ownership outside untrusted worker cooperation

Add a neutral CEF-free mesh process supervisor using the proven process-birth job-list/kill-on-close pattern, with a byte-safe private protocol rather than provider line forwarding. The supervisor receives a checked executable, exact argument vector/cwd/environment and exact parent identity through bounded private bootstrap; it creates only the mesh tree in its job, verifies assignment before resume, and holds exact handles. No ambient shell, PATH search, broad PID-tree scan, foreign process or camera/acquisition lease is involved.

Forward binary stdin/stdout without interpreting stdout as control receipts. Keep authoritative supervisor lifecycle/termination evidence on a distinct control channel. Parent death, control-pipe loss, supervisor death and worker crash cannot leave uncontained owned descendants. Preserve a two-second graceful stop allowance, then terminate only the owned job with a bounded termination/join allowance; drain descendants on normal child exit too. Record successful cleanup only after verified tree termination and supervisor join, not on signal delivery. Retain retryable cleanup failure state instead of clearing ownership early. Cancellation guards cover bootstrap, suspended spawn, prepare and replacement. Supervisor availability is a checked host/runtime artifact; missing/outdated containment gives mesh-only Rebuild guidance, never unsafe direct launch on supported production Windows.

Keep the existing provider supervisor and ABI untouched. Build/invalidate/package the new helper through the core runtime artifact paths, not the person's installed runtime. Use a standalone helper build for targeted local fake-child tests; no full host build is required by this stage. Unsupported platforms must report mesh containment unavailable unless equivalent containment is supplied; they must not claim cooperative EOF is crash-safe containment.

Alternative rejected: relying on Python/worker EOF cooperation, `child.kill()` as descendant proof, or adding mesh into the provider's acquisition job. Those either orphan work or couple optional failure to input.

### 6. Runtime files stay in an owned writable generation

Retain source-contained `program` as the legacy/default form. Add an opt-in runtime reference, not arbitrary absolute paths, environment substitution or a generic command setting. Resolve a plugin-qualified generation beneath the selected workspace's owned mesh-runtime state (normally under `~/.xrbuild`, but tests use task-owned isolated roots). A complete receipt binds owner/id, canonical source/declaration fingerprint, generation, entrypoint and bounded output-integrity inventory. The plugin's future explicit setup/rebuild contribution writes this neutral receipt after preparing its own files; this stage provides validation/resolution helpers and fake receipts, not setup/download consent UI or an installer.

Reject incomplete/building/failed/foreign/stale receipts, linked or escaping ancestors, traversal, symlinks/junctions, hard-linked launch files and modified inventoried outputs. Validate program/args using existing bounded declaration rules; recheck identity/containment and integrity before spawn. Use the resolved generation as the runtime working root so relative model/runtime files stay plugin-owned. Keep all resolved paths, manifests and credentials server-private and out of browser plugin metadata, portable profiles and packages. Metadata discovery can stat/read bounded receipts but never import/query/execute code or recursively hash a large environment on page open; full launch-time integrity work is asynchronous and cancellable without blocking skeleton. Fail closed if files change during checking. These are consistency/ownership checks for trusted installed code, not a security sandbox against a malicious same-user writer.

Alternative rejected: widen source containment to arbitrary user paths, require source-tree virtual environments/models, or route non-Node plugins through embedded Node setup.

### 7. Validate with fake processors and independent visuals

Extend fake codecs, final-pose fixtures and isolated child programs only. Assert confidence/support/age preservation at sampling and modern mesh dispatch; stale generation/result/topology rejection; live ACK sequencing/coalescing; Preparing with a logical seventeen-second startup and hard-bound expiry; reprepare/failure/Stop races; capability downgrade; checked runtime receipts; and Joints/Bones independence under mesh/None/visual opt-out. Preserve before/after skeleton/gesture/interaction traces during held interactions.

Use controlled clocks for slow preparation semantics rather than sleeping seventeen seconds in every test, plus an actual delayed fake child integration test where useful. Actual Windows supervisor tests must include an uncooperative child, grandchild, owner death, supervisor death, crash, Stop during bootstrap and panel disposal, and verify owned death without invoking the person's panel. Use scaled test-only timers/isolated paths; leave production bounds fixed. No model, camera, GPU, private environment or full local suite is required. Do not report a skipped native test as executed containment proof.

## Risks / Trade-offs

- [Legacy peers cannot support live settings or provenance] → Preserve v1 launch behavior, negotiate narrowly and report unsupported/relaunch instead of synthesizing success.
- [Strong process-tree containment adds a native artifact] → Use a small standalone CEF-free target and real fake-child tests; fail mesh-only when it is unavailable.
- [Preparation, attachment and consumer timers can race] → Model separate milestones, hard overall bounds and stop-wins cancellation; exercise deterministic boundary cases.
- [Generation changes suppress old mesh before replacement is ready] → Intentional skeleton-only interval; never trade correctness for apparently continuous but stale skin.
- [Large runtime integrity checks can be expensive] → Passive bounded receipt discovery and asynchronous/cancellable launch-time validation; no render/input-loop wait.
- [File validation is not a sandbox] → Revalidate before spawn, preserve private paths, document the trusted-plugin boundary and refuse unsafe file structures.
- [No real runtime or quality proof] → This stage supplies fake-only contract/lifecycle evidence; later processor/setup and person-authorized visual acceptance remain separate.

## Migration Plan

1. Add optional SDK provenance without required fields for older Hand constructors; provider ABI and serialized HANDS stay unchanged.
2. Ship the negotiated modern declaration/service/client path alongside exact legacy parsing/packets and source-contained resolution. Add the new supervisor to normal checked runtime builds without altering provider binaries.
3. Existing saved selections/settings remain readable; reads never rewrite profiles. Modern runtime references opt in only after explicit external preparation has produced a valid receipt. No data migration or setup is triggered on discovery.
4. Activate current-run backend reconciliation only for negotiated peers, retain honest fallback for old app bundles, and update neutral documentation/minimal existing notices. Hands session/viewport integration remains absent until its separate change.
5. Rollback by selecting None or reverting to legacy declarations/SDK; retain saved per-plugin data and prepared user files. Do not delete runtime generations or reset source/calibration/preferences as rollback.
