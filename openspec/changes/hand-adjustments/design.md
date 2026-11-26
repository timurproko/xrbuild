# Design

## Context

See proposal.md for motivation and the archived hand-input-abstraction design, section G, for the approved follow-up. This design makes that follow-up executable; it does not reopen source migration or provider processing.

Observed on the merged abstraction:

- `hands-state.ts` owns a 16 KiB version-1, workspace-scoped profile with content-hash revision, exclusive writer lock, containment checks, unknown-field preservation and atomic rename. Its writer currently changes only `provider`.
- `panel.ts` resolves source/policy for native/dev/preview/build, captures a running native policy and protects launch/package preparation against source saves. Preview policy already has route/project/token/session binding. `hand-policy-document.ts` stamps checked HTML copies, not app source.
- `hand-source.ts` has the identity `prepareHandFrame` and native/WebXR `HandFrameIngress` before `HandInput.push`. This is the only adjustment stage needed.
- `hand-visual.ts` draws joint spheres, connecting cylinders and a white thumb/index-midpoint sphere on pinch OR grab. Its two blues are linear THREE colours, not CSS values. Style defaults do not currently expose separate visibility/indicator colour/opacity or live mutation.
- `index.ts` owns filtering, interaction/pointer, scene conversion and managed attachment. Its XR-end cleanup already resets ingress/pointer and updates interaction with no hands; geometry Apply must use the same release semantics without ending acquisition.
- `HostChannel` currently accepts only binary messages. The native channel retains the latest payload per type, uses a tokenized loopback URL, and reads controls on a reader thread. Profile delivery is new work, not an existing live-settings facility. Preview projection polling provides an existing bounded cross-origin preview pattern, but Hand profile polling must authenticate the complete run, not reuse a projection-only check.

## Goals / Non-Goals

**Goals:** one validated Hands profile contract; exact identity/default compatibility; one canonical transform for both ingress paths; independent appearance; safe explicit running-app Apply; frozen portable builds; no app wiring.

**Non-Goals:** changing acquisition/calibration/native classifiers, duplicate rig correction, native-to-browser tracking bridges, device discovery by capture, live Hands viewport, recording provenance changes, new filters/gesture thresholds, mesh skins, post-processing loaders, arbitrary app-authored visual restyling, private/plugin changes or modifying user projects. Old bundles require a normal SDK-consuming rebuild.

## Decisions

### 1. Extend the existing record, not plugin preferences or another settings file

Retain `{version:1, scope, provider, ...unknown}` at workspace `config/hands/profile.json`; add optional top-level `offsetMm`, `sizeFactor` and `appearance`. Introduce a browser-safe pure SDK profile contract/defaults/validator reused by panel code, with no filesystem or THREE dependency. Keep workspace scope/source ownership out of the portable profile. The portable adjustment schema has its own version 1.

| Field | Exact standard default | Bounds and UI step |
| --- | --- | --- |
| `offsetMm.x/y/z` | 0 / 0 / 0 | -150..150 mm each; 1 mm |
| `sizeFactor` | 1 | .5..1.5; .01 |
| `appearance.showJoints` | true | boolean |
| `appearance.showBones` | true | boolean |
| `appearance.jointDiameterMm` | 15 | 1..40 mm; 1 mm |
| `appearance.boneDiameterMm` | 15 | 1..30 mm; 1 mm |
| `appearance.jointColorLinear` | [0,.541,1] | exactly three finite components 0..1 |
| `appearance.boneColorLinear` | [0,.482,1] | same |
| `appearance.opacity` | .333 | 0..1; .001 |
| `appearance.showPinchGrabIndicator` | true | boolean |
| `appearance.indicatorDiameterMm` | 30 | 1..60 mm; 1 mm |
| `appearance.indicatorColorLinear` | [1,1,1] | exactly three finite components 0..1 |
| `appearance.indicatorOpacity` | .9 | 0..1; .01 |

Reject invalid types, non-finite or out-of-range values, including invalid stored values, with a field path and reason/range in the API/UI and launch errors. Do not coerce strings, silently clamp, overwrite corrupt storage or start acquisition on validation failure. Missing fields inherit defaults without writing. Retain explicit appearance override presence as well as effective values: legacy profiles must not accidentally override an app's explicit constructor style. Partial appearance overrides affect only their named fields; the standard SDK renderer still has the exact defaults above. Full runtime messages carry the entire current adjustment profile, including override presence, rather than patches.

Refactor the existing writer into one revision-bound transaction used by source Save, inferred-source pinning and adjustment Apply. Preserve current lock, atomic replacement, bounds, containment, regular-file/link and foreign-scope checks, and unknown fields (including unrelated nested appearance extensions). Source writes mutate only provider; adjustment writes only their fields. Conflict means reload/review, never last-writer-wins. On first explicit Apply with no profile file, materialize the same inferred initial source shown by Hands under the existing registry/revision checks, or explicit null if no initial source qualifies; never infer a synthetic fallback. This pins an existing initial choice rather than replacing a saved source. Applying with an unavailable saved source remains possible without modifying it.

Why not a separate appearance file: it would introduce multiple revisions, partial commits and source/profile race paths. Schema stays compatible with existing source-only version-1 records; portable versioning is independent of file metadata.

### 2. Identity fast path and a single canonical-frame transform

`prepareHandFrame` takes the validated geometry snapshot. If all offsets are zero and size is one, return the original frame untouched; do not run subtract/add arithmetic that could change bits or negative zero. For nonidentity geometry create adjusted data without mutating provider frames or recordings.

For each hand, capture its original keypoint-0 wrist `w`; for each supported position `p` compute:

`p' = w + sizeFactor * (p - w) + offsetMm / 1000`

Apply to all 21 keypoints, all capability-present pinch positions, capability-present grab position and palm[0] origin. Palm[1..3] are vectors and stay unchanged under positive uniform scale plus translation. Unsupported optional fields retain their unsupported representation, not translated zeros masquerading as native geometry. Preserve scores, IDs, handedness, clocks, rates, capability masks, pinch flags and grab flag exactly. V1 capabilities follow the current decoder's all-capabilities semantics.

Order is provider calibration/rig correction and panel conversion -> this stage -> existing smoothing/prediction/derived gestures -> scene mapping -> interaction/pointer and drawing. No host, provider, app template or scene-visual transform repeats the adjustment. Metre thresholds and native-pinch opt-in/native-grab defaults stay unchanged; native flags still describe provider decisions even after size changes. Both ingress paths use the same function.

Rejected: scaling around panel origin; translation before scale; scale on a visual group only; applying both in host and SDK. Each either moves the wrist incorrectly, scales the offset, changes only drawing or double-applies geometry.

### 3. Appearance is a mutable drawing layer, not geometry

Extend `HandVisual` with appearance application that updates existing materials, mesh visibility and diameter style, not an extra parent scale or recreation of interaction objects. Retain materials/geometries, render order, roughness, transparency/depth-write and indicator placement. Apply joint/bone visibility independently while preserving data-driven whole-group visibility. Indicator enablement is visibility AND existing pinch-or-grab state; no new native grab marker.

Use linear colour components directly in rendering. The UI converts sRGB for display/picking, but preserves original linear arrays if a colour has not actually changed; displaying an 8-bit picker and saving another field must not quantize the default colours. Preserve exact .333 opacity and default materials/matrices with absent or default global settings. Explicit overrides govern the standard renderer, while absent fields retain low-level explicit constructor styles. Reset Appearance clears its overrides, restoring the standard defaults for ordinary managed apps.

`createXrbApp` continues attaching its one standard visual; `handVisual:false` remains drawing-only opt-out and is never overridden by profile messages. Raw createXrb scene attachment and custom canvases/diagnostics stay app-owned. Documentation must state this boundary rather than promise arbitrary drawings change.

### 4. Snapshot once for each launch/build and retain running ownership

Extend the existing resolution result to include a validated portable profile alongside policy/source. Read/validate and pin them together under existing preparation exclusion; adjustment Apply cannot interleave with launch/build staging. Every Hand-off launch also receives metadata but policy still gates ingress.

| Consumer | Profile delivery |
| --- | --- |
| Native built/dev | Generated host launch config includes initial profile envelope. Host retains/publishes it before hand consumption, including on reconnect/navigation. SDK obtains expected run identity from host metadata, not arbitrary query input. |
| Managed browser built/dev | Checked bootstrap includes the launch profile and bounded run context. Token-authenticated run reads deliver newer snapshots. Dev URLs propagate the same binding; no guessed panel/workspace lookup. |
| Native Launcher destinations/resume | Existing validated same-panel native context reuses the active host profile, even after a saved source changes. Hand-off destinations remain gated. Nested/resume links do not create a second provider or rebind to a browser run. |
| Browser Launcher destinations/resume | Preserve trusted launch scope, route/project/session/token binding and active profile across allowed navigation; bind the destination to the managed preview lifecycle, not a bare `xrb-hand` hint. |
| Desktop/native package | Checked staged HTML/config carries portable build-time profile with resolved provider/settings. No live run identity, control credential or workspace path. |
| Headset package/publication | Checked app-only staged bootstrap freezes profile and browser policy. Both publication branches and portable packager snapshots carry the same values. |

Bundled portable metadata is authoritative for deployment; query data cannot override it or activate live lookup. Do not stamp source files or edit app manifests. Unmanaged old apps without profile metadata retain identity/default behaviour. Managed apps with invalid metadata fail visibly rather than silently interacting at unadjusted positions. Hold managed ingress until an initial valid snapshot is ready; retained channel ordering must not permit a first raw frame through. A disconnect retains the last valid profile rather than reverting to identity.

### 5. Explicit Apply with run-scoped ordered delivery

**Recommend explicit Apply, not live-on-drag.** Position/size alter contact and need cancellation, so applying every drag step would repeatedly release holds and refill filters. Appearance uses the same explicit action for predictable persistence. Reset only changes draft values. Source Save stays separate and next-launch-only.

Keep `PUT /api/hands` as source-only; add a dedicated adjustment Apply operation (proposed `POST /api/hands/apply`) with file revision and complete adjustment values/override presence. It must not submit or replace the picker source draft. GET exposes effective adjustments, overrides, file revision and current live delivery status. Source and adjustment actions use one writer/preparation lock; edits to an existing record do not require a currently available source or a source registry revision when no source change is requested. First-file creation that pins an inferred initial source additionally checks the displayed registry revision; conflicts require reload rather than pinning a different source.

After successful atomic save, capture the owning active run and allocate a strictly increasing sequence for that run. Envelope: `{version:1, runId, sequence, revision, profile}` with opaque file hash `revision`, unpredictable run ID, bounded safe integer sequence and full validated portable profile. Content hashes are not sortable; channel header sequence is not the application sequence. Start at the launch envelope, increment only for delivered profile updates, and never reset the active run's counter on page reload. Bind acknowledgement to the same run, sequence and revision. A source-only save with unchanged effective adjustments does not reset hand state.

- **Native:** add dedicated neutral control/profile/ack message types with bounded UTF-8 JSON payloads under the existing channel header, separate from binary HANDS. Panel sends through the owning runner's tokenized channel; host validates version, size, schema, expected launch run and newer sequence, queues safely from the reader thread, retains the newest profile and broadcasts it to SDK clients. SDK validates again and acknowledges only after application; host relays the matching acknowledgement to panel. Malformed messages do not mutate retained state. Keep the ABI, HANDS v1/v2 and 456-byte hand unchanged. Use nonthrowing native JSON helpers and bounded input, not exception-dependent parsing.
- **Browser built/dev:** add a read-only, no-store profile endpoint bound to the exact active preview token, session, route and project (including validated Launcher hand-off). Poll on the existing bounded preview pattern, about 250 ms, with disposal/abort and narrowly allowed preview CORS. Add authenticated acknowledgement for that run only. No unauthenticated BroadcastChannel/postMessage payload is authoritative. Stale/foreign tokens fail; stopping/replacing a run retires them.
- **SDK:** reject wrong run, stale/equal sequence, invalid profile or disposed subscription before any side effect. At a frame boundary compare effective geometry with the active snapshot. If changed, release interactions using empty-hand cleanup and pointer reset (no click), clear current/scene hands, reset filter/prediction/grace/gesture state, clear visual counts for old data, then atomically swap. Future raw frames pass through the new stage once. Appearance-only swaps update visual properties and do not reset ingress or interaction. Equivalent geometry never cancels a hold. Clear pending obsolete work and fence retired callbacks on disposal.

Persistence and delivery are not one distributed transaction: report Saved for next launch / Applying / Applied / Saved, live delivery failed accurately. SDK acknowledgement, not socket send, establishes Applied. Retry can resend the retained envelope; duplicate sequence is idempotent and can re-acknowledge without reset. Reconnecting pages receive the newest retained profile before using hands. Old bundles that cannot acknowledge show rebuild/relaunch guidance, never fabricated live success. Updating adjustments never changes the active source/policy or starts tracking.

### 6. UI uses existing controls and preserves drafts

Below the source card/picker, add Position and size and Appearance field groups using `renderField`, shared numeric steppers/range, switches/checkboxes, swatches/colour inputs, field grids, help/error and button-row primitives. Do not copy control surfaces/CSS. Use short labels: X / Y / Z, Size; Joints / Bones, Joint diameter / Bone diameter, Joint colour / Bone colour, Opacity; Indicator, Diameter / Colour / Opacity in its subgroup. The only coordinate hint states axes/units. Size hint: "Changes where the hand touches." Appearance hint states drawing only where needed.

Each main group has Reset to defaults; one adjustment Apply commits both groups. Keep source Save/Reload semantics explicit and separate. Adjustment Apply must neither discard an unsaved picker choice nor accidentally save it. Successful source Save rebases clean adjustment state; preserve dirty drafts but require conflict review before applying if their base changed. Incoming change events report stale state rather than silently replacing drafts. Reload intentionally refreshes saved state. All field errors and live delivery status are accessible via the existing help/live regions. Replace obsolete position/appearance-following-change text, but keep no-live-preview truth and optional separate diagnostics link. Controls remain usable without optional diagnostics or hardware.

## Risks / Trade-offs

- [Identity arithmetic or colour-picker quantization changes defaults] -> no-op frame fast path, preserve untouched linear arrays, exact default material/matrix and gesture trace fixtures.
- [Geometry switch blends old and new or cancels like a click] -> one frame-boundary swap, empty-hand release, pointer reset without click and cleared filter/cache state; assert event order.
- [Hash mistaken for order / delayed previous run update] -> explicit run identity plus monotonic sequence, full validation at receiver, stale/duplicate and disposal tests.
- [Startup/reconnect ordering delivers raw geometry first] -> SDK initial-profile readiness gate and host retained profile; fake delayed-profile and navigation tests.
- [Source Save races Apply or inferred pinning] -> one existing file transaction and shared preparation exclusion, preserve unknown fields; exercise competing requests.
- [Saved but not applied reported as success] -> run-bound SDK acknowledgements and explicit partial-success status/retry; no false hardware claim.
- [Scope mistaken for arbitrary app restyling] -> standard SDK visuals only; retain custom drawing ownership and `handVisual:false` documentation/tests.
- [Native lane is not exercised by ordinary PR CI] -> pure channel/config/native unit regressions, plus report actual native build/test status separately; no tracking/hardware startup for acceptance.

## Migration Plan

1. Read existing source-only files as identity/default adjustment profiles without file creation/rewrite; future explicit writes preserve source/unknown fields.
2. Add SDK profile/visual/runtime support and neutral host/panel delivery before exposing controls. Existing provider binaries, recordings and plugin configuration are unchanged.
3. Rebuild SDK-consuming apps normally. Freeze new portable profile snapshots at package/publication time; previously built artifacts stay unchanged and offline.
4. Rollback leaves the source record intact; the preceding writer preserves unknown adjustment fields but older SDK bundles ignore them. Do not delete user profiles or claim old bundles retain adjusted interactions.

## Validation plan

All state, fake projects, browser profiles, proof pictures and disposable server output use an explicitly isolated task-owned root outside the checkout. Never select the person's workspace, projects, saved profile or running panel. Browsers receive deny/fail stubs for media/XR acquisition; native run tests use fake providers/transports, not tracking runtimes. Stop all owned processes/servers in finally/cleanup before reporting.

- Profile/state: defaults with missing fields; invalid numbers/types/ranges/colour lengths; visible reasons; existing unsafe/oversize/foreign/link cases; unknown preservation; concurrent source/adjustment writers and pinning; navigation writes nothing.
- Geometry: bit/object identity, negative zero, non-mutating fixtures, own-wrist scaling, axes/mm/order, two hands, pinch/grab/palm origins versus vectors, capability-absent geometry, preserved flags/scores/clocks; native and WebXR fake ingress feed the same adjusted interaction/pointer points.
- Visuals: default material values and instance matrices/counts match current output; colour no-op round trip; independent joint/bone/indicator visibility and dimensions; appearance does not change coordinates/events/hold state; geometry does; visual opt-out still interacts.
- Delivery: fake owning host channel, SDK application and acknowledgement; actual isolated browser preview endpoint and fake-provider app; stale/equal/out-of-order/foreign/run-replaced/malformed messages, reconnect, initial-frame gate, nested Launcher/resume and Hand-off, source-next-launch retention, disconnected/old-client status.
- Builds: native/dev/browser profile bootstrap, checked packager snapshots and both publication paths; offline frozen values after later Apply; no scope paths/tokens/live dependencies or source-byte edits.
- UI: real isolated Hands page exercises every field, reset per group, Apply versus draft, stale conflict and field error, exact colours and no acquisition. Capture new Hands section in light/dark and narrow layout after implementation in the task's allowed proof folder, never as a claim of plan-stage UI completion.
- Fast planning checks: strict OpenSpec, PR body format, names and whitespace. Implementation checks stay targeted per outcome; broad integration belongs to CI, and native/hardware acceptance is never inferred from a skipped lane.
