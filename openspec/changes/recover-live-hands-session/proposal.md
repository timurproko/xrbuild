# Proposal

## Why

The first real-device Hands report shows intermittent numeric rejection ending acquisition, permanent Stopping controls and false foreign-page ownership on restart. Recovery must tolerate isolated malformed detections while reliably ending the owned worker and releasing its lease without affecting other applications or fabricating hands.

## What Changes

- Admit legitimate ABI values, including zero confidence and finite zero-filled optional fields; reject malformed hands or frames as a counted non-fatal empty observation, preserving valid peer hands where safe.
- Replace cumulative three-error termination with an explicit persistent-invalid-stream policy and bounded, privacy-safe value-kind/joint-index diagnostics surfaced in compact status and failure text.
- Make worker teardown, service ownership release and client completion ordered and bounded, including forced termination of only the contained owned worker and generation-fenced late replies. A stalled stream must recover on fresh input or drain to a terminal state with a clear reason; Start is offered only after verified teardown.
- Reconcile same-page and dead/failed same-panel ownership automatically on explicit Start. Show foreign-page Busy only for a different live owner, with an explicit authenticated take-over action that drains the old worker before new acquisition.
- Cover transient malformed output, persistent failure, hung teardown, restart, reload and takeover races with neutral fakes and disposable isolated processes; document hardware checks still outstanding.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `hand-provider-session`: transient rejection, persistent failure diagnostics, bounded terminal teardown, stale-owner recovery and explicit live-page takeover without unsafe lease theft.
- `hands-module`: recoverable Start/Stop controls, compact rejection diagnostics and actionable true foreign-page contention.

## Impact

Native provider-session frame validation, worker lifecycle and supervisor containment; panel session service and authenticated controls; Hands client, live controls and focused regression fixtures. Existing source/profile selection, recordings and shared SDK semantics remain unchanged. Private integration source is inspected read-only; no source, runtime, calibration or proprietary identifier is exported, and no live panel, user profile or camera is used.
