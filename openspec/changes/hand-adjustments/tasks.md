# Tasks

Each numbered group corresponds, in order, to one PR Implementation outcome. All boxes are implementation work awaiting plan approval.

## 1. Revision-safe global adjustment profile

- [ ] 1.1 Add the browser-safe portable profile contract, exact defaults, override-presence semantics and field-specific validation; unit fixtures cover every bound/type, missing fields and exact linear colours.
- [ ] 1.2 Extend `hands-state.ts` reads and one transactional writer for source Save, inferred pinning and adjustment writes; isolated state tests cover legacy/no-write defaults, invalid stored values, unknown fields, size/link/scope protection and competing writers without lost source or adjustments.
- [ ] 1.3 Add adjustment GET/Apply persistence API under the existing preparation exclusion while retaining source-only PUT semantics; API fixtures cover unavailable/unselected source, malformed requests, conflict reasons and no provider startup.
- [ ] 1.4 Document storage, exact units/bounds, validation and source-versus-adjustment ownership in owner documentation; check examples against the profile fixtures without accessing a user workspace.

## 2. One wrist-relative transform before shared hand processing

- [ ] 2.1 Implement non-mutating geometry adjustment in the existing native/WebXR ingress seam with a literal identity fast path; fixtures assert bit/object identity including negative zero, per-hand wrists, mm axes, scale-before-offset and no double application.
- [ ] 2.2 Transform capability-present pinch/grab/palm origins while preserving vectors, unsupported representations, flags, scores, IDs and clocks; binary native V1/V2 and skeleton-only fake WebXR fixtures assert the exact field behaviour.
- [ ] 2.3 Feed adjusted frames through existing filtering, derived/native gesture policy, interaction and pointer without changing thresholds or defaults; fake-provider traces assert adjusted contact/pointer points and identity gesture parity.
- [ ] 2.4 Document transform order and native classifier/rig-correction boundaries in the SDK README; confirm examples match numeric transform fixtures and require no plugin/app code.

## 3. Drawing-only skeleton appearance

- [ ] 3.1 Add mutable joint/bone visibility, diameters, linear colours and skeleton opacity plus independent indicator settings to the standard renderer; fixtures compare default materials, counts, matrices and pinch-or-grab midpoint to current drawing.
- [ ] 3.2 Layer only explicit global appearance overrides over existing constructor styles without recreating interaction or multiplying geometry; tests assert independent visibility/thickness, absent-override compatibility and unchanged interaction/pointer traces during appearance updates.
- [ ] 3.3 Preserve managed automatic drawing and `handVisual:false` while retaining raw/custom drawing ownership; runtime tests cover opt-out with adjusted interaction and no duplicate attachment, and SDK docs explain the standard-renderer boundary.

## 4. Frozen launch/build profiles and safe running-app Apply

- [ ] 4.1 Capture one validated portable profile with source/policy during native/dev/browser resolution and checked package/publication staging; fixtures cover all targets and both publication branches, snapshot freezing after later edits, offline operation, unchanged source bytes and exclusion of workspace paths/live credentials.
- [ ] 4.2 Add bounded neutral host profile/control/ack payloads separate from HANDS, launch-config retention and reader-thread-safe application; native pure decoder/config tests and fake host-channel integration assert authentication/run/sequence validation, latest retention, malformed rejection and reconnect delivery without starting acquisition.
- [ ] 4.3 Add token/session/route/project-bound preview profile reads and acknowledgement with narrowly scoped CORS and SDK polling/disposal; isolated endpoint/runtime tests reject foreign, retired and mismatched scopes and preserve the last valid snapshot on disconnect.
- [ ] 4.4 Apply newer current-run profiles atomically in the SDK: geometry releases holds without click, clears cached hands and resets filters; appearance-only changes do not cancel or reset. Fake-provider tests assert order, equivalent geometry, duplicate/out-of-order/retired messages, readiness before first hand use and disposal fences.
- [ ] 4.5 Preserve active profiles and source policy through trusted native/browser Launcher destination, nested and resume navigation while retaining Hand-off gating; extend existing context regressions with changed saved source/profile and delayed-message fixtures.
- [ ] 4.6 Expose saved/pending/applied/failed status based on matching SDK acknowledgement with retry/rebuild guidance; disconnected and old-client fixtures forbid false success, and docs distinguish persistent state, live Apply and frozen packages.

## 5. Hands position, size and appearance controls

- [ ] 5.1 Add Position and size / Appearance below the source picker using existing shared field, range/number, switch, colour and button primitives; isolated browser tests cover every setting, keyboard/label access, short hints including size changing where the hand touches, and no capture/runtime startup.
- [ ] 5.2 Keep edits and group-specific Reset as drafts until adjustment Apply, independent from source Save; browser/API tests cover source/adjustment concurrency, dirty draft retention, stale reload guidance, unavailable source and visible field/delivery errors.
- [ ] 5.3 Preserve exact untouched linear colour arrays through sRGB picker display and unrelated Apply, including .333 default opacity; browser regression covers no-op colour round trip and each group's reset without affecting the other or source/calibration.
- [ ] 5.4 Update Hands guidance and SDK/owner usage examples for explicit Apply, safe cancellation and build freezing; verify guidance against isolated UI/runtime fixtures and remove obsolete adjustment-follow-up copy without claiming live preview.
- [ ] 5.5 Capture implemented Hands controls in light/dark and narrow layout from an isolated panel with fake provider and task-owned state, store pictures outside the checkout, and stop every owned browser/app/server before reporting; report actual targeted checks and any skipped native lane without hardware claims.
