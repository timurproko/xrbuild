# Proposal

## Why

The provider-centred Hands page deliberately has no generated hand and remains idle without an acquisition session. People need to explicitly start their globally selected provider and see its actual hand through the same pipeline and adjustments as apps, without launching an app or competing for its cameras.

## What Changes

- Put explicit Start/Stop above Skeleton provider, with honest compact lifecycle/no-detection/error feedback, frame-derived tracking fps and age in the existing chips/viewport, and no added sidebar status sentences.
- Add a Windows headless input-provider process using the existing neutral loader and input ABI, with no display, browser host or plugin changes.
- Share an exclusive acquisition lease with managed native app launches across panels/checkouts; show the owning app or Hands session and require explicit Stop rather than terminating another owner.
- Deliver authenticated, bounded newest frames with session identity, epoch, sequence, clock mapping and full validation to the existing SDK viewport seam.
- Reuse the global profile, ingress, default filtering, gestures, scene mapping, visuals and acknowledged immediate-commit semantics from the adjustments/page changes; clear all hands and holds on discontinuity.
- Supervise start cancellation, Stop, crash, disconnect, page closure, panel shutdown and timeout, releasing ownership only after acquisition has ended.
- Add small shared SDK pinch/drag targets driven by the live session, not a new fixture mode, plus fake-provider/synthetic-only software regressions and an explicit physical-machine checklist.
- Expose validated raw-as-published provider frames and provenance to PR 51's retained recorder, before global adjustments; version new provider-stream recordings separately and replay through the common pipeline exactly once.

## Capabilities

### New Capabilities

- `hand-provider-session`: exclusive acquisition ownership, authenticated live delivery and supervised provider lifetime independent of display apps.

### Modified Capabilities

- `hands-module`: replace the page-only idle limitation with explicit provider sessions, live status/metrics and real-hand test targets while preserving passive navigation, source Save and shared adjustments.

## Impact

- Native provider loading/callback bridge, built-in inputs, a CEF-independent worker build, a shared native lease utility, app-host acquisition and native test DLLs. Input ABI and the 456-byte hand remain unchanged.
- Panel provider/settings resolution, host runner/preparation, runtime freshness/rebuild inventory, session routes/socket supervision and shutdown. No new persistence schema or private source export.
- The core Hands page and SDK viewport adapter delivered by PR 51, using PR 50's profile validator, controls, geometry reset and application acknowledgements. Neither pipeline nor form is duplicated.
- Sequence: PR 48 is merged; PRs 50 and 51 are still drafts at planning time. This planning-only branch targets main; implementation waits for PR 51 including PR 50 integration, then incorporates that code in this same branch before editing it. Prefer both merged to main; if work must overlap, integrate the approved PR 51 head locally and keep this PR draft into main until its dependencies merge. Reconcile delta requirements additively.
- Estimate: 5–8 engineer-days after those seams are available, excluding review queues and physical-device acceptance. This PR does not provide concurrent app observation, WebXR acquisition, camera images, legacy recording migration, post-processors, meshes or cross-logon-session camera arbitration. PR 59's owner-approved simplification supersedes PR 51's visible recorder and explicit Save/Apply UI: source choices save on change, adjustments commit immediately in standard sections, and recording compatibility remains off-page. This PR incorporates its delivered head, preserves that layout and supplies raw provider-stream hooks/format/provenance without mounting recorder UI. Provider metadata follows the existing app data root without override or calibration migration; all new core state stays workspace-owned.
- No hardware, camera or tracking runtime is available. Only a test-built fake input DLL and the existing explicitly selected synthetic provider may run in isolated state; actual device startup, calibration, camera release and end-to-end latency remain unverified until the person's checklist is completed.
