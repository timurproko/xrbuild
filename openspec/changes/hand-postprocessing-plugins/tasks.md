# Tasks

Implementation requires plan approval and the landed PR #50 profile/delivery contract. No production processor or model is part of these tasks. Groups match the draft PR Implementation outcomes in order; the optional split in design.md requires separate approval.

## 1. Metadata-only stage declarations and registry

- [ ] 1.1 Add the versioned handStages contract and plugin metadata validation for fixed slots, schemas, execution/context, bounded settings, signal policy, dependencies, output channels and limits; exercise valid and malformed declarations in targeted contract tests.
- [ ] 1.2 Add origin-qualified installed discovery with owner/content/contained-entry/runtime inventory checks and disabled/conflicting/missing diagnostics; use import/process/download traps to demonstrate metadata-only behavior and no user-state creation.
- [ ] 1.3 Document the neutral declaration and trust/containment boundary in extension contract docs; check documented examples against the validator and keep all fixtures test-only.

## 2. Global profile and saved versus active snapshots

- [ ] 2.1 Extend the landed common Hands transaction with ordered processing entries, explicit bypass consent, coherent byte limits and independent pipeline Save; cover stale registry/file revisions, unknown/uninstalled data preservation, unsafe state and competing source/adjustment/pipeline writes.
- [ ] 2.2 Introduce required-processing portable profile versioning and panel/SDK/native round-trip validation without scope, runtime paths or credentials; cover legacy adjustment-only defaults, missing fields and unsupported/oversized versions with pure profile and native parser tests.
- [ ] 2.3 Pin active pipeline identity separately from next-session saved state and combine live adjustment snapshots only with that active pipeline; exercise source-only, appearance-only and geometry Apply without accidental processor activation or draft loss.
- [ ] 2.4 Document next-session settings, content/schema review and downgrade limitations; verify examples preserve the existing source and adjustment contracts.

## 3. Ordered bounded SDK execution and safe failure

- [ ] 3.1 Add immutable associated frame/result contracts and skeleton execution before the existing single adjustment transform; use a test-only in-process inert adapter to assert order, provenance, coherent/derived signal policy and source immutability.
- [ ] 3.2 Add post-sample geometry dispatch with distinct pose sequence, capture/sample clock association and source-confidence provenance; assert geometry sees the final sampled pose rather than raw WireHand data.
- [ ] 3.3 Implement production worker adapter, one-in-flight/newest-pending stage and chain bounds, total deadlines, cancellation and epoch/revision/hand-incarnation fencing; deterministic-clock tests cover saturation, out-of-order, malformed and retired results.
- [ ] 3.4 Integrate slot-specific failures with shared release/filter/pointer reset and explicit-only bypass; timeout/crash-during-hold tests demonstrate no click, raw-frame leak, silent fallback or stale geometry revival.
- [ ] 3.5 Keep the no-enabled-stage path synchronous and unchanged with no worker/clone; test frame object and numeric-bit identity including negative zero, capability-absent fields, nonidentity adjustment baselines and native/browser interaction traces.
- [ ] 3.6 Document processing order, budgets and failure behavior in SDK contract docs; match examples and state names to targeted runtime tests without claiming real model performance.

## 4. Managed native sidecar lifecycle and readiness

- [ ] 4.1 Implement bounded authenticated loopback broker/protocol with private bootstrap, role/run/origin binding and start/ready/frame/result/reset/stop/crash states; exercise malformed messages, foreign credentials, queue limits and declared content identity with an actual inert test child.
- [ ] 4.2 Add the owned-process supervisor and Windows Job Object launcher, readiness/heartbeat/stop bounds and no-shell contained execution; isolated process-tree tests cover crash, startup rollback, stop and supervisor death without hardware or optional runtimes.
- [ ] 4.3 Connect supervisor ownership to native built/dev run lifecycle, host/dev errors, disposal and shutdown; assert no orphan children, retired credentials or stale status after each exit path.
- [ ] 4.4 Deliver runtime descriptors over the existing authenticated host channel and require SDK contract/application acknowledgement before hand delivery; test old bundles, initial/reconnect gating, trusted Launcher navigation and exclusive consumer-generation transfer.
- [ ] 4.5 Reuse run-bound acknowledgement for adjustment resets and explicit failed-stage Retry without importing next-session settings; exercise duplicate/stale/foreign acknowledgements and visible geometry-only readiness degradation.
- [ ] 4.6 Document the sidecar wire/lifecycle contract and owned-helper build/use paths; report actual targeted native/helper results separately from skipped ordinary PR native lanes.

## 5. Common optional geometry and standard mesh drawing

- [ ] 5.1 Add the provider-neutral optional geometry accessor, bounded topology negotiation/cache and finite/index/byte validation; tiny inert test meshes exercise two hands, topology replacement, unknown optional extensions and resource rejection.
- [ ] 5.2 Draw accepted geometry through common panel mapping under the standard visual root using global bone color and opacity; visual tests cover handVisual false, existing layer visibility/indicator controls and no repeated size/offset.
- [ ] 5.3 Enforce geometry deadlines, age/displacement limits and immediate no-detection/hand-loss invalidation with deterministic buffer disposal; compare geometry-only and skeleton-only interaction traces and assert stale replies cannot restore a mesh.
- [ ] 5.4 Document the common accessor, appearance mapping and inferred-versus-measured provenance; a neutral app fixture shows standard mesh rendering with no plugin-specific branches or app edits.

## 6. Honest context and deployment refusal

- [ ] 6.1 Add common enabled-pipeline preflight to native built/dev, browser preview/dev and trusted navigation preparation; API-level fixtures verify supported managed-native ownership and explicit unsupported/old-consumer errors before startup.
- [ ] 6.2 Apply the same refusal before both publication paths and every offline host/headset packager stages output; fixtures assert no processor/runtime/asset/token leakage and no silently dropped enabled stage.
- [ ] 6.3 Preserve disabled/empty pipeline frozen-profile deployment and Hand-off behavior; targeted build/publication tests demonstrate unrelated apps start no stage and old output remains unchanged.
- [ ] 6.4 Document the native-only execution support table and explicit disable/rebuild recovery; check that advertised contexts match actual preflight tests rather than metadata claims alone.

## 7. Independent Hands section and integration

- [ ] 7.1 Add root-scoped hands-postprocessing component with load/save/subscribe and refresh/dispose, mounting after Source and before Position and size without redesigning the concurrent page; isolated browser fixtures validate remounting and disposal.
- [ ] 7.2 Render installed/missing stages, enable switches, fixed-slot ordering, bounded schema fields, explicit skeleton bypass and truthful saved/active readiness/runtime status; exercise all controls, one-sentence empty state and passive navigation.
- [ ] 7.3 Preserve independent source/adjustment/pipeline drafts and conflict recovery through Save, Apply and plugin/status refresh; browser fixtures assert pipeline saves are next-session-only and cannot start a process.
- [ ] 7.4 Integrate the test-only in-process and actual inert sidecar fixtures through global profile, managed run, optional mesh and status paths; cover fail-open geometry, fail-stop skeleton, explicit bypass and unsupported context end to end without shipping a processor.
- [ ] 7.5 Capture isolated light/dark/narrow component proofs and finish neutral user-facing usage/recovery documentation; confirm all task-owned servers/children stop and report known gaps plus actual targeted check results.
