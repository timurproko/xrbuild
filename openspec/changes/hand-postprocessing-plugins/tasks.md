# Tasks

Implementation approved for the reduced scope. PR #50 is merged; the page mount is supplied by PR #51. Four groups match the draft PR outcomes. The real plugin is a separate later task after feasibility; use only one fake sidecar plugin in tests.

## 1. Installed mesh declaration and global selection

- [x] 1.1 Add the small versioned handMesh declaration and metadata-only owner/entry/settings validation; contract tests trap imports, downloads and process starts and cover conflicting/disabled owners.
- [x] 1.2 Extend the landed Hands profile transaction with None/one selected identity and retained bounded per-plugin settings; tests cover missing profiles, unknown/source/adjustment preservation, stale revisions and missing saved plugins.
- [x] 1.3 Document the declaration and next-run selection contract; validate neutral examples and confirm no stage-order, refinement or bypass fields are introduced.

## 2. Optional desktop sidecar supervision

- [x] 2.1 Start only the selected contained sidecar for managed desktop Hand runs and deliver separate authenticated run-only metadata; use one fake sidecar to test ready/start failure, foreign tokens, consumer epochs and skeleton-only old-client fallback without input gating.
- [x] 2.2 Implement bounded frame/result transport, one in-flight/newest pending, freshness/size/finite/index checks and pinned launch settings; fake-sidecar tests cover delayed, malformed, wrong-epoch and missing-plugin fallback.
- [x] 2.3 Own stop/crash/host-exit/panel-exit cleanup with bounded waits and pipe/watchdog owner loss; actual isolated child tests assert termination and retired credentials, and document the minimal protocol without runtime/model setup.

## 3. Final-pose dispatch and standard mesh drawing

- [ ] 3.1 Dispatch owned final sampled poses asynchronously without modifying ingress or interaction; compare skeleton bits and gesture/pointer/grab traces for None and healthy/late/crashed fake sidecar, including different provider fixtures.
- [ ] 3.2 Draw validated mesh in standard hand visuals with existing mapping, bone color/opacity and handVisual opt-out; fake geometry tests cover no double adjustment, no-hand/hand-loss/geometry-change invalidation and buffer disposal.
- [ ] 3.3 Keep preview/publication/offline/unmanaged paths skeleton-only without refusing them or exporting mesh metadata/credentials; targeted context fixtures and SDK documentation show no app edits and no new portable-profile protocol.

## 4. Selector component and end-to-end proof

- [ ] 4.1 Add the root-scoped Post-processing component after Source and before Position and size, with None/installed selector, settings, Save, status and the single-line context notice; isolated browser tests cover empty/missing states, independent drafts and conflicts without a page redesign.
- [ ] 4.2 Connect saved-next-run selection and actual run status; one fake-sidecar integration test demonstrates automatic mesh, visible fallback, unchanged interaction, next-run switching and cleanup with no hardware or user-state access.
- [ ] 4.3 Finish concise user documentation and isolated component proofs; confirm all owned processes are stopped and report actual targeted checks without claiming a real processor or model benchmark.
