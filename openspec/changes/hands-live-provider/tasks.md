# Tasks

Each numbered group corresponds to one PR Implementation outcome, in the same order. Implementation is approved; the delivered PR 51 view/recorder and merged PR 50 controls are incorporated.

## 1. Exclusive acquisition ownership for Hands and managed native apps

- [x] 1.1 Incorporate PR 51 with PR 50's profile/control integration into this branch after approval; re-read and reconcile their merged specs, verifying this delta preserves all unrelated requirements.
- [x] 1.2 Add the secured user/logon-session native lease and bounded advisory owner metadata, including a minimal CEF-free reservation/handoff helper; process tests cover cross-workspace/checkouts, competing providers, corrupt metadata and PID reuse.
- [x] 1.3 Gate managed built/dev native preparation and host input create on the same lease, with one-use child handoff under the transition gate; race/cancellation tests assert one owner and no competitor input/display startup.
- [x] 1.4 Keep input-free/browser XR launches outside the native lease, enforce updated host capabilities and refuse detected legacy host conflicts; runner/freshness tests cover busy-owner labels, no implicit Stop and old-runtime rebuild guidance.
- [x] 1.5 Cover abandoned owner recovery, inaccessible/live owner refusal and app exit cleanup with native multiprocess tests; document supported scope and standalone/legacy/cross-logon limits in docs/hand-provider-sessions.md.

## 2. Headless provider worker with unchanged input ABI

- [x] 2.1 Add the standalone native/provider-session CMake entry and extract only reusable loader/input bridge, clock/serialization/socket and input-built-in dependencies; build and link checks prove the worker/tests require no CEF, display or platform runtime.
- [x] 2.2 Resolve and snapshot the selected owner-qualified source and workspace settings through existing panel resolvers, with revision checks and existing inferred-choice pinning; resolver tests cover missing/ambiguous/dirty/unsupported sources and no fallback.
- [x] 2.3 Load/create/start/stop/destroy through the existing input ABI, validate function tables and bounded borrowed frames before copying, disable debug images and preserve provider reasons; test-built fake DLL checks lifecycle, callback quiescence and byte/layout compatibility.
- [x] 2.4 Add bounded stdin bootstrap/commands and structured secret-free lifecycle events plus runtime rebuild/cache inventories; worker tests cover bad bootstrap, create/start failure, no hands, concurrent callbacks, malformed frames, hung stop/destroy and crash.
- [x] 2.5 Exercise the existing explicitly selected synthetic provider through the same worker with isolated paths and document worker build/configuration commands; no private provider or device/runtime is started.

## 3. Authenticated bounded session service and complete supervision

- [x] 3.1 Add capability-bound session bootstrap/status/Start/Stop and exact Host/Origin/fetch-metadata checks without widening preview CORS; isolated route tests reject cross-origin, stale/foreign owner, malformed and unauthorized controls without acquisition.
- [x] 3.2 Add worker loopback authentication roles, bounded binary envelopes, one-in-flight plus newest-pending delivery and consumer acknowledgements; actual fake-worker socket tests cover credential leakage, slow readers, rejected payloads and bounded pending bytes.
- [x] 3.3 Implement epoch/sequence admission, four-timestamp clock mapping/uncertainty, future/age checks and injectable freshness/liveness deadlines; transport tests cover backwards time, stale/duplicate/retired frames, invalid values and valid empty-frame health.
- [x] 3.4 Implement native supervisor mode with pre-resume job containment and exact panel-process monitoring, plus idempotent cancellation/Stop and verified-death recovery; process tests cover start timeout, worker hang/crash, panel crash and abandoned lease reacquisition.
- [x] 3.5 Wire page/socket/heartbeat loss and panel shutdown into cleanup without relying on unload fetch; isolated lifecycle tests assert bounded shutdown, no automatic restart, no live-owner lease stealing and no orphan worker. Document authentication, deadlines and failure recovery.

## 4. Live frames and profile Apply through the existing SDK view

- [ ] 4.1 Connect the authenticated session client to PR 51's neutral viewport adapter after initial PR 50 profile readiness; parity tests feed equivalent frames/clocks through app and Hands and compare processed coordinates, capabilities, gestures and standard visuals.
- [ ] 4.2 Reuse the single ingress geometry stage and app-default filters, prediction, gestures and scene mapping without raw diagnostic options or visual transforms; tests assert exactly-once offset/wrist-size and unchanged identity/default behavior.
- [ ] 4.3 Deliver full applied profiles with session-bound ordered acknowledgements and accurate per-target delivery status; tests cover appearance-only hold preservation, geometry release/reset, initial gate, dirty drafts, source retention, failed delivery and old-session replies.
- [ ] 4.4 Clear ingress/filter/visual/interaction/pointer state on explicit no-hands, stale stream, clock reset, failure, Stop and disposal; held-pinch/drag regressions assert release without click and no resurrection by late frames. Document the adapter/profile contract and safety boundaries.
- [ ] 4.5 Agree provider-stream v1 through comments on PRs 51 and 53, expose immutable pre-adjustment raw frames/provenance to its recorder, and supply bounded format/validation/replay helpers; round-trip tests preserve native packets and a nonidentity replay profile is applied once.

## 5. Explicit live Hands controls, measured status and real-hand targets

- [ ] 5.1 Add shared-style Start/Stop beside provider status while retaining PR 51 layout/tabs, independent source Save and PR 50 adjustment controls; isolated browser tests cover dirty source, changed saved source, second-tab ownership and occupied-owner stop-first guidance.
- [ ] 5.2 Drive Not started/Starting/Running/no hands/Stopping/Failed/Stopped, tracking chip, capture age and compact metrics from actual session evidence; browser tests distinguish rendered/predicted/reported/received rates and missing frames from empty detections.
- [ ] 5.3 Add small SDK pinch and drag targets driven only by current session hand events; fake-provider end-to-end tests cover success, no detection, geometry Apply and Stop mid-hold, with mouse orbit excluded from hand-test success.
- [ ] 5.4 Keep unsupported-platform/WebXR guidance explicit, missing plugins nonblocking for the page and idle/error view empty; regressions assert passive navigation, no synthetic fallback and byte-identical unrelated profile fields, plugin data, recordings and project sources.
- [ ] 5.5 Publish the short person-run device checklist and remaining unverified hardware/latency/camera-release limits in docs/hand-provider-sessions.md; capture isolated default-window and supplementary responsive/theme proof outside the checkout, record actual checks, then stop every owned disposable process before handoff.
- [x] 5.6 Fold in PR 51 review follow-ups: source notices distinguish next Hands session/app launch from active acquisition, and legacy playback speed rebases elapsed time at the previous rate; hands-page and actual playback-control regressions cover both.
