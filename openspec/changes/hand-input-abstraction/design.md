# Design

## Context

See proposal.md for motivation. Approved for implementation with simplified global migration: every saved hand-provider name means Hand, without compatibility phases or input-semantics versions.

### 1. What “raw provider data” means

Raw means **the provider's published result**, not unfiltered sensor measurements. Acquisition, calibration, upstream inference/filtering/prediction, native gesture generation and conversion into the panel frame remain provider responsibilities. Core does not remove, duplicate or retune those operations. The independently inspected integration analysis, including private revision and file references, is retained in the task's local design annex rather than exported into this public repository (docs/confidentiality.md prohibits private source inventories here).

The public boundary is concrete:

- `native/plugin-sdk/include/xrb_plugin.h:17-20,68-109`: 21 points, panel-centred metres (+X right, +Y up, +Z toward viewer), source-local IDs, confidence, capture timestamp meaning newest sensor-data arrival, and optional pinch/grab/palm capabilities. `XrbHand` remains exactly 456 bytes.
- `native/host/src/main.cpp:449-517`: host currently starts every concrete input at app launch, remaps IDs and forwards frames separately. It does not fuse providers. This change resolves managed Hand to just one source before that boundary.
- `packages/sdk/src/index.ts:203-210,587-600`: native channel and WebXR already feed the same `HandInput`. `packages/sdk/src/hands.ts` provides downstream One Euro smoothing, prediction, grace, gestures and native-signal compatibility. Keep all existing defaults: native pinch opt-in, native grab enabled when declared. Published native pinch/grab/palm fields and capability masks must survive unchanged.

### 2. What draws hands today

Drawing is already outside native input providers. `packages/sdk/src/hand-visual.ts` owns 21 joint spheres, connecting bone cylinders, and the white sphere shown when **pinching OR grabbing**. It places that sphere at the thumb/index midpoint, not the provider's native grab position. There is no separate SDK grab-position marker. `packages/sdk/src/index.ts:120,522` constructs and updates this renderer; applications choose whether to attach `handsObject`. `scene-hands.ts` derives scene-space geometry, while pointer emulation and the separate mouse cursor are not skeletal drawing.

Today's exact default appearance is joint diameter 15 mm, bone diameter 15 mm, joint linear RGB (0, .541, 1), bone linear RGB (0, .482, 1), shared opacity .333, white pinch/grab indicator diameter 30 mm with opacity .9. These are **linear colour components**, not equivalent CSS RGB/hex values. Rendering is spheres/cylinders, not a skinned mesh.

Not all drawing uses that default: `embedded/plugins/input-hands/samples/hand-tracking/src/main.ts:88-89` creates diagnostic/rejected styles; its `src/live/visual.ts` separately draws observed joints/bones/axes. `embedded/projects/archive/hands-check/index.html` and `archive/rig-check/index.html` draw their own canvas skeletons and gesture-dependent colours; SDK-based launcher/showcase/hello-cube attach the SDK object. UI Kit control glows/dot shells and mouse cursors are interaction feedback, not hand markers. Private adapter/app drawing findings are in the local annex. Do not claim a global SDK appearance setting can restyle arbitrary app-authored canvas/meshes or optional raw diagnostics.

### 3. Hands ownership and lifecycle today

The `/hands/` route and `/hand-tracking/` alias are currently declared by the optional embedded input diagnostic, not core (`embedded/plugins/input-hands/xrb-plugin.json`). Its native provider is synthetic; observation/reconstruction modes are diagnostic, not alternate app skeleton providers. Configuration should remain available without that plugin or its compiled viewer.

The single-host comment in `native/host/src/main.cpp:122-128` says machine-wide, but the actual named mutex is `Local\\XRBuildHost`: it excludes hosts across checkouts in the **same Windows logon session**, not necessarily across all Windows sessions. Native providers start in main.cpp's app startup loop; `XrbInputApi` has no hot-switch/settings method. A second full host cannot safely serve a laboratory alongside an app. This first change creates no worker, opens no device and does not weaken the lock.

## Goals / Non-Goals

**Goals:** stable logical input, global source ownership, honest states, unchanged provider signals, and a shared identity ingress seam designed first for position/size adjustment. Behaviour parity for old per-app provider assignments is explicitly not required.

**Non-goals in this PR:** live hand preview; offset/size or appearance controls; profile editing/delivery; post-processing plugin loading; meshes/skins; recording; gesture tests; acquisition worker/broker; calibration/runtime/advanced-setting removal; changing any provider's tracking code; per-app provider/profile options; multiple simultaneous providers, fusion or failover. The immediate next change is offset/size **and appearance**, ahead of the laboratory, as specified below.

## Decisions

### A. Registry, not a renamed concrete provider

Add an optional bounded `handProviders` declaration to the existing plugin manifest. Example uses a fictional neutral provider:

```json
{
  "handProviders": [
    { "version": 1, "id": "tracker", "transport": "native", "runtimeName": "tracker", "purpose": "tracked" }
  ]
}
```

At most eight distinct bounded IDs per owner. Version 1 fixes skeleton layout/coordinates/timestamp semantics to the existing ABI; native declarations must name an input binary owned by that selected origin. Display/platform binaries cannot claim it. Label defaults to the existing plugin title; an optional bounded label distinguishes multiple sources. Purpose is `tracked`, `synthetic` or `replay`. No manifest script entrypoint, model path or new native function table is added.

Normalize to `{ owner, id, label, transport, runtimeName?, purpose, aliases, state, reason }`. Owner is `core`, `bundled:<plugin-id>` or `workspace:<plugin-id>`; persist `{owner,id}`, never label, DLL path or presentation alias. Use the existing catalog/origin and binary-ownership checks, not load order. Existing `panel.providerNames` supplies read aliases; a new declaration must not hijack another owner's aliases. Duplicate/invalid/missing selected origins are unavailable, never fallback.

Because the current native input role already promises this hand ABI, undeclared validated native inputs get a **compatibility descriptor** with id equal to runtimeName and existing presentation aliases. That keeps older installed providers working without hardcoding integration names. Explicit declarations with the same id supersede that owner's implicit descriptor without changing saved identity. The private integration needs only the metadata declaration shown with its actual existing runtime name in the local annex; no private edits occur in this task.

Core registers built-in simulated and replay inputs and the existing WebXR adapter through the same normalized descriptor contract. The browser adapter has `transport: webxr`, no DLL and session-required state. This is a registration path for core, not an ABI extension. General third-party browser adapters and post-processing plugin descriptors are future contracts.

Alternatives rejected: renaming a plugin to Hand still exposes implementation selection per app; inventing a second skeleton ABI risks old binaries/recordings; assuming every manifest labelled input owns any discovered DLL bypasses ownership checks.

### B. One global explicit selection and honest states

Store version 1 state at `<selected-workspace>/config/hands/profile.json`, initially `{ "version": 1, "provider": { "owner": "...", "id": "..." } }`. `provider: null` means unselected. There is one shared record per selected integration workspace, including when project repositories differ. Do not use plugin preferences, browser localStorage or app manifests for the new provider choice.

With no saved choice, exactly one installed enabled real (non-synthetic/non-replay) source compatible with the requesting execution context is the initial default, displayed as selected in Hands. Zero or several real sources require a choice. Resolve and pin that initial default on the first explicit launch or preference Save so it can never become a fallback after removal. Discovery/GET creates nothing; once a choice exists it is never silently replaced. Explicit null is an intentional unselected choice, not permission to infer another default. Use bounded (16 KiB) regular/unlinked files, parent containment, revision-aware writes, cooperating lock and atomic replacement; preserve unknown fields, reject malformed/foreign/concurrently edited state without resetting it. Global scope follows the selected workspace, not every workspace on the machine. Numeric/appearance fields are reserved for follow-up design, not partially implemented controls.

Registry states distinguish installed/enabled/ABI-compatible from unbuilt, disabled, missing, ambiguous, incompatible-context, configuration-required and runtime state (`starting`, `running`, `needs-setup`, `device-missing`, `failed`). An installed provider is not proof of connected hardware. Idle says **Not started; device availability checked at launch**, not Ready/Running. Last runtime failure is tied to the provider/run, not inferred by opening a camera. No-hands-detected is not provider failure.

The app Input multi-select offers Mouse, Keyboard and Hand; no concrete hand providers. A **new** Hand option exists only when a compatible provider is installed and enabled in that execution context. Config-required providers count as installed but show their problem. A previously selected Hand remains visible as unavailable when none qualify. Core simulated counts as installed if the native host exposes it, so a healthy native core installation can offer Hand without hardware; this does not select simulated automatically. A native plugin alone cannot make browser Hand available.

If Hand is selected but the global source is missing/disabled/failed/incompatible, show that source and problem. Even if another source is installed, never silently substitute it. A running app retains its launch snapshot when source selection changes; show **Applies on next launch**. Refuse preference mutation during launch/package preparation so state cannot change between validation and spawn/staging; do not live-switch acquisition.

### C. Hands becomes core-owned configuration, not a synthetic lab

Core owns `/hands/` with the shared panel shell, and `/hand-tracking/` redirects there. First delivery is only a labelled Skeleton provider picker, source/purpose and availability/reason, explicit revision-bound Save, and next-launch guidance. No preview placeholder claims real data is live. It remains available with zero providers and offers honest recovery links, not install/capture side effects.

Move the optional diagnostic declaration to a distinct `/hands-diagnostics/` route/tool label, retaining its existing service endpoints and user data. Link to it as **Acquisition diagnostics (separate source)** only when available. Do not embed its synthetic viewport as the primary view of the selected source. Reserve the core route so unrelated custom tools cannot shadow it; migrate the known embedded declaration here rather than silently ignore route collisions. Existing preferences/calibration/recordings remain where they are. The built-in Hands surface does not require optional viewer setup.

### D. Resolve once for every consumer

Create a single panel-side resolution operation taking effective project/run inputs, registry revision, global profile revision and execution context. It yields logical inputs, exactly one selected source (or none), concrete native role selection, selected owner/binary closure, effective provider config, and a source-policy snapshot. All run, dev, build and package validation call it rather than each interpreting `hand` differently.

| Consumer | Resolution and delivery |
| --- | --- |
| Native built app | Replace logical `hand` with the chosen runtimeName in the generated host config; include only validated owner binary roots. Keep Mouse/Keyboard unchanged. No `--input=hand` reaches the host. Existing provider defaults + workspace settings + project provider config + explicit CLI precedence stays intact. |
| Native dev | Same resolved config and source policy, with the dev URL; no separate provider choice. |
| Browser/WebXR preview, built or dev | Selected WebXR source feeds existing joint conversion during an explicitly entered XR session. Unsupported XR is visible; idle waits for a session. A selected native-only source is incompatible and blocks a Hand-enabled preview with guidance, not camera startup or substitution. Serving a static preview document alone starts nothing. No native-to-browser bridge is built here. |
| Desktop/native package | Resolve at explicit build, freeze concrete selection/config and stage only its owner using existing checked portable-input rules. Package runs offline without panel/global workspace access; local global source changes do not mutate old packages. Missing/nonportable provider assets/config fail explicitly. |
| Published WebXR build | Resolve the same global source at build. Only a browser-capable source is accepted for Hand; package a bounded source-policy bootstrap with checked staged output, no workspace identity/paths. Native DLLs are not copied or magically bridged. |
| Direct old host CLI / old packages / unmanaged old browser apps | Their concrete configs and existing SDK WebXR defaults remain supported; no ambient panel lookup or state rewrite. Raw CLI `--input=hand` without resolved context gets an actionable error, not a default source. |

Managed SDK source policy is a bounded `off/native/webxr` launch/deployment context, not a new app-facing provider override. There are no old/new input-semantics versions. All managed applications use the same policy derived from logical inputs and the global source. Carry it through existing launcher destination/return context without loosening URL trust. Gate WebXR ingestion when managed Hand is off or assigned to native, so entering XR does not inject a second source. Both accepted ingress paths call one identity `prepareHandFrame` stage before `HandInput.push`, after native timestamp conversion or WebXR panel conversion. In this change it preserves optional fields/capabilities and feeds the unchanged processing defaults. Future typed layers attach here; no loader, transform, smoothing changes or wire identity envelope is introduced. Rendering plugins later attach downstream to processed SceneHands, not to native tracking code.

Keep source/session generation and revisions in the managed launch lifecycle outside HANDS payloads. On end/disposal reset hand/filter/capture state; late retired-session messages cannot affect the next session. Source changes require restart in this PR. The binary HANDS v1/v2 readers, 456-byte hand and recordings remain untouched.

### E. Simple normalization, no compatibility phase

Read every input other than Mouse/Keyboard/none as logical Hand, including unknown or missing old provider names and arrays naming several providers. Deduplicate to one Hand. Apply uniformly to singular `input`, `inputs`, platform choices and personal run settings. Every such app launches the globally selected source immediately; no per-app concrete assignment survives and no adoption UI or semantics version exists. Reading and launching do not rewrite source manifests. The next explicit settings Save writes canonical `inputs`, removes singular `input`, and normalizes saved platform choices. Preserve `plugins.<provider>` configuration and unrelated fields. Old per-app source parity is deliberately waived; native pinch/grab signals from the chosen provider are not changed. Embedded installed sources stay immutable.

### F. Existing hidden/development providers

- Built-in `simulated`: a clearly labelled synthetic source in Hands, not another app Input kind; never automatic fallback.
- Embedded `hand-tracking`: another synthetic source with its existing scenarios/settings, registered under its owner. Its synthetic data does not define Hands.
- Built-in `replay`: a replay source; existing file/loop settings and recordings remain compatible. Without a configured recording, show configuration-required, not Running. This PR adds no file browser or recorder; new acquisition configuration UI is later.
- `calibrated`: currently only an excluded UI name, **not a built-in provider** in `builtin_inputs.cpp`/`builtin_providers.cpp`. If an installed extension actually owns it, register its existing hand ABI source normally; its saved name still means Hand, not permission to substitute a source. Do not invent or alias it to a different provider.
- Diagnostic RGB/RGB-D observations are not registered as app skeletons: camera/surface-relative observations have not met the canonical panel-space joint contract.

### G. First follow-up: position, size and appearance profile (recommended separate PR)

**Priority:** the first practical adjustment is position/size, not the live laboratory. Recommend keeping it as **change 2 immediately after this abstraction**, together with appearance. Current abstraction/migration/packaging is roughly 6-9 engineer-days; adding correct profile controls, live delivery and geometric/visual regression coverage here adds 3-5 days (combined 9-14). A small second PR can ship adjustments before a native live viewer exists and avoids hiding a behavioural geometry change inside registry migration. No adjustment goes in an acquisition plugin. These are design commitments for sequencing, not checkboxes delivered by this PR.

Extend the same Hands-owned global profile with:

| Setting | Default | Proposed validated range / meaning |
| --- | --- | --- |
| `offsetMm.x/y/z` | 0 / 0 / 0 | Each -150..150 mm, 1 mm UI step; panel +X right, +Y up, +Z toward viewer. |
| `sizeFactor` | 1 | .5..1.5, .01 step; uniform skeleton scale about **each hand's current wrist**. **Changes fingertip positions and where the hand touches**, unlike appearance thickness. |
| `appearance.showJoints` | true | Boolean; drawing only. |
| `appearance.showBones` | true | Boolean; connecting cylinders only. |
| `appearance.jointDiameterMm` | 15 | 1..40 mm, 1 mm step; drawing only, never interaction radius. |
| `appearance.boneDiameterMm` | 15 | 1..30 mm, 1 mm step; drawing only. |
| `appearance.jointColorLinear` | [0, .541, 1] | Three finite linear-sRGB components 0..1; UI picker converts to/from sRGB. |
| `appearance.boneColorLinear` | [0, .482, 1] | Same encoding; separate colours retain today's two blues. |
| `appearance.opacity` | .333 | 0..1; affects joints/bones only. |
| `appearance.showPinchGrabIndicator` | true | Boolean; existing sphere on pinch OR grab, no gesture-policy change. |
| `appearance.indicatorDiameterMm` | 30 | 1..60 mm; drawing only. |
| `appearance.indicatorColorLinear` | [1, 1, 1] | White by default; finite components 0..1. |
| `appearance.indicatorOpacity` | .9 | 0..1, separate from skeleton opacity as today. |

Reset restores this exact identity/default profile, with explicit Apply/Save; it does not reset provider calibration or change the selected source. Invalid numbers/NaN/infinite/out-of-range values are rejected rather than clamped silently. Missing fields inherit today's behaviour without a rewrite. App-authored explicit/custom visuals remain app-owned; absence of global appearance overrides retains existing custom constructor styles. Explicit global appearance overrides govern the standard SDK renderer across managed apps; do not force an app to attach a hand object it deliberately omits.

Transform order: provider acquisition/calibration/rig correction -> canonical frame -> **user scale about wrist, then panel-space offset** -> existing shared filtering/gestures -> scene mapping -> interaction/pointer and drawing. For wrist `w`, point `p`, factor `s`, and mm offset `d`: `p' = w + s*(p-w) + d/1000`. The wrist does not move under size alone; smaller factors pull fingertips toward it, not toward panel origin. Translate/scale all present geometric points, including optional native pinch/grab/palm origins; rotate/normal vectors are unchanged by positive uniform scale/translation. Preserve IDs, scores and native gesture flags/capabilities. SDK-derived pinch uses adjusted geometry and unchanged metre thresholds; native gesture flags still represent provider decisions and cannot be retroactively recalculated upstream. Do not promise size rewrites the provider's native grab classifier.

Provider rig correction has already been applied when the frame arrives. User offsets are a distinct additional adjustment, never copied into plugin calibration/rig files, never inferred from them and never also applied in the host. Identity is a no-op; processing happens exactly once at shared SDK ingress for native and WebXR. Appearance happens only after scene mapping and cannot affect touching, pinch thresholds or pointer coordinates.

Every launch/build receives one versioned validated profile snapshot together with source policy; native/dev via managed host context, browser via run-scoped context, packages/publication via bounded portable snapshot. No app reads a guessed panel URL or workspace path. For **running managed apps**, follow-up Apply sends a revisioned full profile through a neutral JSON control message (panel -> owning host -> SDK channel, or authenticated preview-run channel). This is separate from the binary HANDS payload. Ignore stale revisions/retired runs. Apply geometry atomically after releasing held controls/pointer presses and resetting filters, so old/new transforms are not blended or double-applied; appearance-only edits update materials/visibility without cancelling interactions. Snapshot source selection remains next-launch only. Offline old packages stay frozen; applying new values there requires rebuilding or a separately authorized local profile editor, not a remote dependency.

Adjustment follow-up acceptance must cover: identity/default snapshots preserving today's look and gesture traces; a known wrist/fingertip fixture proving wrist-centred scaling and mm offset exactly once on native/WebXR; all optional geometric fields transformed coherently while flags/scores remain intact; thickness/colour/visibility edits leaving interaction coordinates/events unchanged; sRGB picker round-trip preserving the exact default linear colours; revisioned Apply releasing captures only for geometry changes; Reset; stale/late messages; and offline package snapshots. Custom canvas/diagnostic visual exceptions must be documented, not silently restyled.

### H. Recommended remaining sequence after adjustments

Rough engineer-days, assuming existing adapters and no model/runtime/device work:

1. **This PR: abstraction, registry, picker and migration** — 6-9 days; no preview/adjustments.
2. **Global offset/size plus skeleton appearance and safe Apply** — 3-5 days, first priority above.
3. **Real selected provider live outside apps** — 4-6 days. An explicitly started headless provider worker/session service must reuse loader/ABI, own capture exclusively, publish bounded loopback frames/status with clock/session generation, support cancellation and reliable stop/crash cleanup, and render through the same SDK profile/pipeline. It must not acquire the full display/CEF host's lock or weaken app exclusivity. Add a cross-process acquisition lease shared by worker and app launch; initially block Start while another app owns hardware, with explicit Stop first. WebXR requires an explicit XR session, not a native worker. Navigation starts nothing. This lifecycle prerequisite, not a selector, enables a real live Hands viewport.
4. **Shared post-processing plugin API and ordered layers** — 3-5 days; versioned descriptors, safe ordering, lifecycle/reset/identity and per-layer availability. Start with existing scale/offset implementation as the reference stage, not duplicate transforms. More profile knobs follow only with concrete processing semantics.
5. **Explicit recording/replay of the selected pipeline** — 2-3 days; define raw-vs-processed recording provenance so playback never applies adjustments twice; private user storage and limits.
6. **Gesture/interaction tests in Hands** — 2-3 days; shared SDK/UI Kit tasks, capture/status/event traces, no independent gesture implementation.
7. **Advanced visuals/anatomical mesh** — 3-5+ days plus asset/license acceptance; current simple colour/thickness/visibility settings already ship in change 2.

Concurrent app observation/control needs a shared acquisition broker/subscription model and explicit ownership policy; estimate separately after exclusive live view, not an implied feature of the worker. No camera/runtime experiments are authorized by planning.

## Risks / Trade-offs

- [Old apps change provider] -> Deliberately approved simplification: all old provider names mean one global Hand; the owner will recheck the few apps manually. No compatibility or adoption machinery.
- [Initial default mistaken for fallback] -> Only infer one real source before any saved choice, pin it on explicit launch/save, and retain unavailable saved choices.
- [Synthetic core source makes native Hand usually available] -> Distinguish installed from selected/running; no default source, no fallback and no fake hardware-ready state.
- [Selected source unavailable in another target] -> Clear incompatibility, not per-target provider preferences or automatic WebXR substitution.
- [Hidden-provider routes and independently installed diagnostics] -> Reserve core routes, migrate bundled declaration, keep diagnostic endpoints/state and test collisions.
- [Unchanged upstream filtering plus SDK prediction] -> Preserve current behaviour exactly; document raw-as-published, do not add another filter or claim sensor-raw output.
- [Dropped native gestures or transform applied twice] -> Capability/byte/gesture trace regressions now; identity transform and optional-coordinate tests in adjustment follow-up.
- [Private metadata not yet released] -> Generic legacy ABI registration keeps current binaries usable; metadata-only follow-up in its owning repository, no private branches/source exports here.
- [Package drift or local-path leaks] -> Freeze revision/owner closure and checked portable snapshot; missing/incompatible/nonportable input fails before packaging.
- [Old SDK app bundles] -> Logical policy/profile requires normal SDK-consuming rebuild; old concrete apps/packages retain old behaviour. Do not claim the panel can patch arbitrary historical app JS.

## Migration Plan

1. Land backwards-compatible declaration/registry and Hands record API with read-only discovery. Do not create state on navigation.
2. Introduce core picker and normalize every concrete input name to Hand in memory, preserving plugin config and immutable installed sources.
3. Route every managed execution/package consumer through the global resolver and identity SDK ingress; preserve recording readers, not old per-app provider assignments.
4. Release metadata-only provider declarations independently; implicit native-role registration works before their release. Next settings Save writes canonical inputs; no explicit adoption or input versions.
5. Add focused tests below; no hardware tests or background setup. Rollback before a settings Save leaves manifest bytes unchanged. Older core cannot understand canonical `hand`: restore the previous manifest input or use a previously built concrete package; preserve rather than delete the new global record.

## Validation plan

Use isolated fixture workspaces/profiles under the task's output area; never the person's live panel/state or physical devices.

- Catalog/manifest fixtures: explicit and legacy declarations; spoofed/mismatched ownership/role/ABI; duplicate origins and aliases; disabled/unbuilt/missing plugin; installed-but-unconfigured replay; no-provider and core WebXR/synthetic contexts; discovery starts no capture and writes nothing.
- State/API fixtures: two app/project repositories share one choice; revision/lock/atomic failure; malformed/oversized/linked/foreign records; unknown-field preservation; unique-real initial default, zero/multiple-real choice-required and no replacement after pinning; next-launch snapshot/race behaviour.
- UI/navigation fixtures: only Mouse/Keyboard/Hand; unavailable saved Hand retained; core Hands without optional viewer; picker Save, stale conflict and failure reasons; old route redirect and distinct diagnostic route; no camera request/runtime start on navigation.
- Launch/dev/browser/package fixtures: one source resolved before config and dependency closure; browser/native mismatch fails, WebXR session gating and Hand-off gating; owned package source/config only; offline snapshot; existing launcher trust/context propagation unaffected.
- Normalization fixtures: singular input, unknown concrete names, several providers collapsing to Hand, platformSettings, embedded run.json and effective-manifest refresh/copy. All apps use the global provider; next settings Save writes canonical inputs and retains plugin config. Discovery/run leave manifest bytes unchanged. No adoption/version/parity tests.
- SDK protocol/signal fixtures: existing 456-byte ABI/wire v1/v2 and recordings, capability-preserving identity ingress, native and WebXR use the same seam, source disposal/reset and late-frame exclusion; existing hand-signal/grab/pinch traces unchanged.
- Delivery gates: strict OpenSpec validation, delivery PR-body validation, name guard, targeted type/tests and diff whitespace. No hardware/native tracking acceptance is claimed.
