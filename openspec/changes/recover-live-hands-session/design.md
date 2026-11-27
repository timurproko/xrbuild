# Design

## Context

See proposal.md for motivation. Inspection of the final merged runtime found:

- `native/provider-session/published_frame.h` rejects any non-finite keypoint component and confidence outside the neutral ABI's 0..1 range with one undifferentiated message. Zero confidence and finite zero-filled optional fields already pass. The validator rejects the entire callback when any hand is bad.
- `native/provider-session/main.cpp` increments a lifetime invalid counter and fails at three rejects without resetting after valid callbacks. It records no rejected component or joint. The latest valid slot can retain older hands while invalid callbacks are dropped.
- The client `stop()` notifies its terminal state before clearing `current`. `hands-live-controls.js` derives Stopping from `current.retired`, so terminal rendering can observe the obsolete retired context. A fetch that never answers also has no client stop deadline.
- The controls map every service `busy` response to foreign-page Busy even when `owns` is true. The service rejects every new Start while busy, including its own cancelled session. Page credentials are memory-only, so reload obtains a distinct owner and old ownership waits for lifecycle cleanup.
- Native freshness is 10 seconds without a valid snapshot; the browser clears after 250 ms and has a separate 10-second no-fresh-input timeout, but three stale clock admissions can terminate sooner. The UI cannot currently distinguish no callback, rejected output, unsynchronized transport and an old worker still draining.
- The supervisor already creates its worker inside a kill-on-close job before resume and retains the exact process handle. Service death checking instead probes a numeric PID after launcher close, which is weaker evidence than the supervisor's exact handle.

Private integration inspection was read-only. It establishes pass-through joint scores, fixed-width optional buffers and absent-buffer zero initialization, not the particular numeric sample produced on the reporting machine. There is no evidence justifying a different confidence scale. Do not infer that zero confidence caused the error, clamp unknown scores, copy integration source or branch core behavior on a private provider identity.

## Goals / Non-Goals

**Goals:** Keep transient detection errors non-fatal, make stalled recovery honest, bound owned teardown, and reconcile authenticated ownership without overlapping device users. Preserve valid coordinates/native signals and neutral ABI semantics.

**Non-Goals:** No camera access, private provider changes, source export, runtime/model installation, synthetic substitution, profile/calibration edits, changes to the shared application's hand filtering, or arbitrary process termination. An app's native lease is never a page-takeover target.

## Decisions

### 1. Separate observation rejection from persistent stream failure

Return structured admission results: healthy, partially admitted, rejected hand/frame, or terminal contract/clock failure. Validate safe sizes/counts/pointers before dereferencing. Preserve valid peer hands and their bytes; never manufacture missing joints or normalize an undocumented score scale. Zero confidence remains legitimate; NaN/infinity and out-of-range ABI confidence reject that hand. Unsafe headers/pointers reject the entire callback. Clock discontinuity retains its existing explicit failure semantics.

An all-rejected safely timed observation clears hands/holds as no admitted hand this frame, not a genuine zero-detection claim. Whole-frame unsafe metadata clears through a bounded diagnostic/freshness path without inventing a capture timestamp. Count rejected frames and hands separately and retain only a bounded enum-like kind, joint index (0..20 where relevant), component and count. Example feedback: `Rejected confidence-range at joint 8; rejected hands 3`. No raw positions, IDs, private paths or credentials are logged.

Use a 10-second persistent broken-output window with at least three rejected callbacks still in the recent window (a minimum recent rate of 0.3/s), reset by healthy output (including genuine empty detections) or a valid peer hand. Keep at most 512 rejection timestamps; lifetime totals are diagnostic only. Isolated rejects separated by healthy output cannot fail through a cumulative counter. All-malformed output must still fail after the window rather than keeping an empty stream alive indefinitely. Distinguish this from no callback/transport silence. Failures append the last safe kind/index summary. Bound diagnostic publication frequency and storage rather than emitting a log per bad callback.

Propagate diagnostics through bounded worker lifecycle/status data and client feedback. Diagnostic-only empty observations must not fabricate provider fps or enter raw recording as an unchanged provider packet. Fully valid packets keep byte-exact recording; valid peers retain exact values, and any filtered packet's admission provenance must remain explicit rather than masquerading as the original whole callback. Keep strict browser/wire checks; tolerance belongs at the borrowed-provider boundary, not by admitting malformed wire bytes.

Alternative rejected: weaken every finite/confidence check or clamp all scores. That could hide a real contract mismatch and pollute gestures/recordings.

### 2. One authoritative teardown completion path

Service stop is idempotent and fences tokens/epochs first. Centralize terminal cleanup so start failure, worker failure, disconnect, heartbeat expiry, stalled timeout, explicit Stop and panel close all release exactly once after preparation/reservation drains and owned process completion is verified. Propagate cancellation into pending preparation/reservation and prevent late work from launching after cancellation.

Keep the worker's 5-second shutdown watchdog, service graceful-stop deadline and forced supervisor fallback bounded. Strengthen supervisor completion reporting around its retained process handle/job: join the exact worker after graceful or contained forced exit before reporting termination. Forward only complete bounded stdout lines so a forced-kill partial JSON tail cannot corrupt the receipt. Publish worker PID and creation identity before resume; if launcher death loses the receipt, a bounded read-only helper compares creation identity and waits on the exact process handle without signaling or killing a reused PID. Do not identify a process by label or kill an untrusted PID. If OS teardown cannot be verified, expose a terminal failed/recovery state and block reacquisition honestly, not permanent Stopping, false foreign-page Busy or enabled unsafe Start.

Client stop uses bounded requests and status reconciliation. Clear the matching local retired context before notifying terminal listeners; do not let late stop/start/status results clear a replacement generation. A network timeout cannot assert that a camera is released: reconcile with the service and keep the owned-draining state until confirmed. Controls render the completion result, not a stale `session.stopping` getter.

Alternative rejected: clear Busy/enable Start immediately on any error. It can leave a real camera worker alive behind a free-looking UI.

### 3. Recover stale ownership without weakening authorization

Separate page identity/liveness from renewable control capabilities. Use a per-document opaque identity plus a reload-safe same-tab continuity proof, stored only in tab-scoped session state, never profiles or URLs. Renew/reload binds only after same-origin authenticated validation and cannot adopt a different live page by guessing a label. Preserve the old epoch fence and retire old credentials/sockets. Passive reload requests cleanup/reconciliation only, not capture.

On explicit Start, drain same-page ownership and dead/failed same-panel sessions before acquiring. Different live-page ownership remains Busy with an explicit take-over action. A takeover request binds to the observed session identity and ownership generation, checks a fresh page capability, and atomically fences/drains that designated Hands session before making a new reservation. Concurrent takeovers, old page heartbeats and delayed Start replies cannot affect the winning replacement. OS-native exclusion remains authoritative across panels/checkouts. A foreign panel must cooperate through authenticated owner-directed shutdown; absence of that proof never authorizes force-killing a foreign PID. Apps retain stop-first behavior.

This intentionally extends the current stop-first-only page contract; the spec delta records that change. Do not treat heartbeat age alone as proof that a process no longer owns devices.

### 4. Stalled is recoverable or terminal, never a lease leak

Retain 250-ms hand/hold clearing and truthful dash metrics. Distinguish startup/waiting from a previously fresh stream becoming Stalled. Fresh valid input within the liveness window resumes without a new Start. Replace short cumulative stale/reject failure with the bounded no-healthy/no-fresh policy; after 10 seconds without usable fresh input, retire and run the same verified teardown path. Include whether the cause was no callbacks, rejected observations, clock/transport absence or cleanup still in progress. Start cannot be offered while the previous worker is still alive.

### 5. Targeted, hardware-free verification per delivered outcome

- Extend native `provider-frame-tests`, the test-built ABI DLL and `hand-provider-worker.test.ts` for zero confidence, absent/zero optional data, NaN/infinity positions or scores, confidence below zero/above one, mixed valid/malformed hands, healthy recovery between rejects and sustained-invalid failure diagnostics.
- Extend service/client lifecycle tests and a mounted live-controls browser regression for terminal-notification ordering, failed/stuck requests, forced owned-worker shutdown, empty detections, no frames, slow startup, stale clock admissions, Stalled recovery/timeout, release-once and fresh Start only after join.
- Extend acquisition/transport disposable-process tests in random test namespaces for worker/supervisor/panel death and restart, same-page leftovers, page reload, live foreign-page refusal/explicit takeover and simultaneous/stale takeover requests. Spawn only fake/test providers; never the real provider or production acquisition namespace.
- Run only affected test files/native targets. Keep all disposable output in the crew task folder and stop every started process before handoff. Publish the final implementation head through normal Git/PR publication, ensure CI is scheduled for it and report immediately without waiting.

## Risks / Trade-offs

- [Actual hardware numeric sample is unknown] -> Do not invent a scale or cause. Enumerated diagnostics and person-run hardware checks close this gap; a source-only finding is not a camera measurement.
- [Filtered observations could falsify raw provenance] -> Separate rejected/clearing diagnostics from unchanged raw packets and preserve admitted peer values exactly.
- [Takeover adds authority beyond ordinary page Stop] -> Require explicit same-origin authenticated action, observed ownership generation and completed designated-worker teardown; do not touch apps or arbitrary foreign processes.
- [Stalled metric can be mistaken for zero detections] -> Separate no-callback/rejected/stale causes, never fabricate fps and preserve clear timeout reasons.
- [Native job tests can accidentally contend with real acquisition] -> Require test-built workers/helpers and random isolated namespaces; no production camera or mutex use.

## Migration Plan

No stored-data migration. Rebuild the changed native session/helper runtime through normal project delivery after implementation; existing profile/calibration/recording files remain untouched. Rollback is a code/runtime rollback, not user-data reset. Physical device release/reacquisition, partial-out-of-view behavior, actual score distributions, axes/latency and driver/runtime assumptions remain explicitly unverified until the person tests hardware.
