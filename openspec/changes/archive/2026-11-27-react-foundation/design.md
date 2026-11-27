# Design

## Context

See proposal.md for motivation and specs/app-components/spec.md for behavioral requirements.

The inspected base is origin/main d56e18be84bb7aca296cbebb13c2df1cd592d39b. `packages/sdk/src/index.ts` already provides `XrbAppRuntime`, a stable managed camera, idempotent mouse binding, automatic hands/cursor attachment, resize/projection subscriptions and a single `renderer.setAnimationLoop` callback. Today its app frame runs before `xrb.render()`, which itself samples hands, resolves interaction, updates pointer emulation and draws mono, stereo or XR. Merely advancing components from the existing app callback would expose the previous frame's hands.

`Interactor` owns target selection/capture and mouse rays; `PointerEmulation` emits pointer plus compatibility mouse events and a release click. The React integration must not connect Fiber's ordinary DOM event manager on top of that path. Hello Cube currently has a separate DOM click raycaster, damped OrbitControls, three rotating cubes, a grid, an independent `icon.ts`, and explicit pagehide cleanup. Its existing cleanup fixture must evolve with its new entries, not be removed as obsolete.

Apps use source aliases selected by `XRB_CORE`; embedded dependencies and frozen locks are separate from the core workspace. `embedded-inputs.ts` currently fingerprints SDK/UI sources explicitly, so the new bridge must join that existing build-input list. No control-panel UI is needed.

Registry inspection during planning reports Fiber 9.8.2 and React 19.3.1 as latest stable. Fiber 9.8.2 custom-root implementation was inspected: even with `frameloop: 'never'`, configuration writes size/DPR, installs XR session handlers that replace the XR animation callback, and unmount can force context loss on a supplied renderer. These are explicit integration hazards, not solved by disabling its ordinary loop.

## Goals / Non-Goals

**Goals:** Make components independent of app bootstrap, expose existing SDK capabilities without another runtime, and provide a small optional bridge whose guarded ownership is regression-tested against a pinned current Fiber 9 release. This is strictly an under-the-hood re-architecture: every existing app must look and behave exactly as before; Hello Cube must be visually and functionally identical, not merely similar.

**Non-Goals:** No template, UI Kit or other sample migration; no themes, colour/mesh-style system, app-settings registry/tab, control-panel UI, Theatre.js, pmndrs/xr, editor, native ABI changes, runtime remote components or new provider acquisition. Do not create placeholders for later theme/settings behavior. Components accept ordinary props and providers can wrap their tree later without changing SDK ownership.

## Decisions

### 1. Optional custom root, not Canvas

Add `packages/react` (`@xr-build/react`) as an opt-in source package, with React 19 and latest stable Fiber 9.x pinned coherently in the owning lockfiles. Keep React imports/dependencies out of the vanilla SDK entry. Extend the Fiber element catalogue with the app's single Three installation and configure a `createRoot` root against the SDK's scene and managed camera, with `frameloop: 'never'`. Keep the SDK standard visuals outside the React-owned content group.

A narrow renderer facade forwards rendering-state reads and allowed operations to the same real SDK renderer; it does not construct another renderer or graphics context. Guard Fiber's `setSize`, `setPixelRatio`, animation-loop writes, direct `render`, renderer disposal, render-list cleanup and context-loss paths. Expose a read-through XR view without Fiber session ownership/subscriptions. Set the managed camera's Fiber `manual` policy so Fiber's viewport update cannot rewrite its projection; restore bridge-owned metadata when detaching from a borrowed runtime. Mirror SDK view dimensions into Fiber's size/viewport metadata for layout only. Preserve SDK output colour/tone-mapping choices during configuration. Components needing the actual renderer use the SDK context.

Install a bridge-owned positive-priority frame subscriber that suppresses Fiber's automatic draw; the facade is a second safety boundary, not a substitute for that suppression. Advancing the root never calls raw renderer drawing. Do not rely on application `useFrame` priorities for correctness, mutate Fiber private priority fields, globally monkeypatch Three, or attach a second DOM resize observer.

**Alternative: Canvas with frameloop never.** Rejected: Canvas introduces a DOM/layout lifecycle, default camera/event connection, resize/DPR management and XR ownership that all need to be undone. It does not solve the custom-root hazards either and obscures ownership.

**Alternative: independent reconciler or manual React-to-Three updates.** Rejected: duplicating Fiber's reconciler forfeits its current component ecosystem and increases upgrade burden. A guarded Fiber custom root retains it while containing its runtime assumptions.

### 2. One SDK frame, explicit component phase

Add a narrow opt-in SDK component-frame subscription/phase rather than replacing the legacy frame callback. Preserve existing vanilla callback ordering when no bridge is attached. For bridged frames the single SDK animation callback supplies `timeMs` and `deltaSeconds` and calls `xrb.render()` exactly once. Inside that SDK submission:

1. Accept pending profile/source changes, read XR data when presenting, and sample processed hands once.
2. Establish the SDK camera/panel mapping and expose the current hands to component context.
3. Advance only this Fiber root once with SDK elapsed seconds, passing the current XRFrame when available. `useFrame` and the new frame hook share that advance; initialize/reset the Fiber clock so its first delta matches the SDK's zero first delta, including stop/start. Do not advance all roots or run global Fiber effects for unrelated apps.
4. Refresh camera/world matrices and scene-space hand mapping after component controls/transforms; do not resample acquisition. Resolve SDK targets and deliver SDK pointer/interaction events, then update standard visuals.
5. Draw through existing icon, mono, stereo or XR code and existing SDK telemetry. Two stereo eye draws are one SDK render submission, not two component advances.

The new phase is inactive without a bridge. The icon fast path also advances component work once where needed, without accidentally sampling/attaching ordinary hands or bypassing icon capture/ready behavior. React state remains scheduled by React; frame-time animation uses refs, and event-driven state updates may commit on the next SDK frame. Tests distinguish a single SDK submission from legitimate per-eye raw renderer calls.

### 3. Small explicit React API

Provide and label all exports as new opt-in APIs in `packages/react/README.md` and SDK docs:

- `mountXrbApp(container, children, options)`: create the normal SDK renderer/runtime when not supplied, attach the Fiber root, and return a handle with readiness, tree update and idempotent asynchronous disposal. Support attaching to a caller-supplied stopped managed runtime with explicit borrowed ownership; reject a second live attachment to the same runtime/canvas. It starts only after successful root setup/commit.
- `useXrb()`: the existing SDK app/runtime, including real renderer, stable camera and scene; invalid outside the bridge.
- `useXrbFrame(callback)`: callback with the current SDK frame and its elapsed/delta clock; implemented through Fiber's once-per-SDK-frame subscription, not another timer. Ordinary Fiber `useFrame` also works.
- `useXrbHands()`: a stable frame-readable view of current processed SDK hands and scene hands; no React render per joint/frame, no second input state machine. Document reading it inside frame callbacks and subscribing to existing SDK gesture events for discrete UI state.
- `useXrbPointer(objectRef, handlers)`: component callbacks for SDK-picked mesh hover/move/down/up/click and misses, using the SDK registry described below.
- `useXrbTarget(target, handler)`: effect-scoped registration/subscription of an existing SDK physical interaction target; callbacks retain SDK event/source/reason semantics. Target construction belongs to a component's committed lifecycle.

Do not promise all Canvas DOM/Fiber event-manager features. Document this supported event subset, hit data, nearest-hit and parent bubbling/stop behavior, cancellation, and unsupported browser-event assumptions. The explicit hooks avoid dependence on Fiber private mesh-handler storage and make later UI Kit wrappers thin SDK target consumers. Public components accept props, so later theme and settings providers need no bootstrap redesign.

### 4. SDK input remains the only arbiter

Add a small optional SDK-owned mesh-pointer registration/event surface. The existing `bindMouse` path computes rays once (including mono orthographic and stereo eye-half normalization) and offers uncaptured pointer events to this registry. It raycasts only registered scene objects and emits typed hit/miss data to component callbacks. Do not attach Fiber's DOM event manager or a second bridge click raycaster. Existing SDK targets and held captures take precedence; the new mesh route cannot steal a held target. Keep drag/release/cancel bookkeeping in the SDK route and deliver one activation per existing click, not again from compatibility mouse or native click events. Preserve Hello Cube miss-to-clear and its exact baseline click/drag behavior; do not introduce new gesture thresholds, selection policy or controls behavior under the guise of deduplication.

Physical poke/pinch/grab/volume handlers subscribe directly to existing target events, not remapped synthetic DOM gestures. SDK pointer emulation stays available for OrbitControls and uncaptured mesh selection. Carry internal source/hand/cancellation provenance on SDK-emulated pointer events (without changing external provider/wire contracts); after SDK target capture, suppress component mesh dispatch for that hand. This prevents an emulated pointer echo from activating a captured control while retaining legacy DOM behavior. Loss, profile reset, disable and unmount cancel rather than click. Mouse-off and pointer-off remain distinct SDK policies. Tests cover real pointer plus compatibility mouse input, physical target plus emulation, misses, nesting and both stereo halves.

Implementation refinement from paired input comparison: the vanilla Hello Cube used a whole-canvas managed-camera ray, which is observably different from correct per-eye SDK rays in stereo. Preserve that historical sample behavior through an explicit optional `ComponentPointerOptions.camera` compatibility policy, computed and picked inside the same SDK route. Hello Cube opts in; the bridge default and new controls retain SDK per-eye picking. This adds no second application picker, changes no delivered outcome and avoids silently fixing visible behavior during re-architecture.

### 5. Stable cameras and SDK eye rendering

Fiber always sees the same `ManagedCamera` object. The SDK can change its perspective/orthographic flags and matrices in place; bridge metadata follows the SDK without mutating aspect/frusta. Mono uses the SDK's existing orthographic or off-axis perspective path. Side-by-side rendering still uses SDK eye cameras/viewports and doubled output width. WebXR uses SDK session entry/exit, virtual panel, tracked perspective cameras and hand adapter, including when the selected mono mode is orthographic. Fiber never installs XR session callbacks or calls an XR loop setter. Returning from XR restores SDK mono/stereo sizing/projection, not cached Fiber sizing. Preserve the dedicated icon subject and orthographic icon framing; no ordinary Canvas camera enters that path.

### 6. Ownership, Strict Mode, HMR and failure cleanup

Create the app mount outside component render/effect replay. React StrictMode wraps only the component tree; each registration effect cleans up before replay and uses current handler refs. Do not perform runtime creation in a component body, so Strict Mode cannot allocate two SDK runtimes. Guard asynchronous configure/commit/start with a generation token and a single disposal promise. Stop the mount-owned loop and unregister frame/input/view callbacks immediately when disposal begins; wait for component effects and root teardown before releasing owned SDK resources and renderer/canvas. Borrowed runtimes are stopped during detachment and returned usable, not disposed; callers explicitly restart them. External primitive resources remain caller-owned unless explicitly adopted.

HMR updates the existing mounted tree for component edits. Bootstrap replacement disposes the previous handle, waits for teardown and then mounts; never reuse a closing Fiber root as a new owner. Stale setup/disposal completions cannot mutate a replacement. Roll back partial setup on errors. Preserve pagehide behavior: dispose on real departure, not a persisted back-forward-cache transition. Focused tests use real React/Fiber with a renderer spy and deliberate delayed setup, not only source-text assertions.

### 7. Hello Cube is a run entry plus component library

Move scene composition into exported components (for example `HelloCubeScene` and `RotatingCube`) in TSX; `src/index.ts` exports them and their props only. Keep bootstrap, page lifecycle and renderer creation in `src/main.tsx`. Express lights, cubes, grid and scene background declaratively; animation uses the shared frame hook. Manage OrbitControls in a cleanup-safe effect against the SDK camera/real canvas; do not adopt a control wrapper that replaces the camera. Keep cube positions, colours, rotations, selection clearing/highlight, damping and periodic stats behavior. Exported scene content can be mounted more than once without sharing mutable resources or selection.

Keep `src/icon.ts` standalone and unchanged in behavior, `base: './'`, app manifest/output directory and stable `dist/icon.js`; switch only the HTML run script to TSX and use the React Vite transform for development. Expose the source component entry in package metadata and document a consumer Vite alias. No additional library distribution build or runtime import map is needed: another app aliases the public source entry, and Vite bundles it. Deduplicate `three`, `react`, `react-dom` and `@react-three/fiber` across the consumer, bridge and sample. Keep exact baseline geometry dimensions, transforms, lighting intensities/colours, material defaults, renderer output/tone mapping, grid styling, camera parameters, icon framing and selection feedback; Fiber defaults must not introduce appearance changes. Update both owning lockfiles and JSX/type boundaries without enrolling embedded/private packages in the core workspace. Include bridge source/manifest in existing managed build fingerprints with a narrow backend regression.

## Verification plan

Only focused tests/builds are run locally; no root full suite. Add tests with real Fiber/React plus SDK renderer/input spies and extend affected SDK/sample fixtures. Name final test files during implementation in the report; intended commands are package-local bridge tests, selected SDK `app-runtime`, `xrb-webxr`, `interaction-core` and pointer tests, Hello Cube tests/build, a small source-alias consumer build, and the embedded-input fingerprint regression. JSX tests use a pinned TSX-capable runner or precompiled fixture, not Node's unsupported TSX type stripping. Run the production type check for the new public API and affected SDK code and validate this OpenSpec change.

| Area | Automated assertion | Runtime check after implementation |
| --- | --- | --- |
| Frame ownership | Sample -> component/useFrame -> interaction -> draw; shared first/next/restart clock; one SDK call, no independent RAF/draw | Browser animation, stats and controls continue without duplicate loop warnings |
| Mono perspective and orthographic | Stable camera identity and matrices across repeated resize/mode switches; facade rejects Fiber size/DPR overwrites | Open sample, orbit/select/miss, toggle both projections and resize; retain framing and correct hits |
| Side-by-side stereo | Fake host eye dimensions and poses produce two SDK eye draws but one component callback; left/right pointer rays agree with SDK | Use a simulated host fixture for reproducible two-eye screenshots; actual display checks are separately identified if hardware is available |
| WebXR | Session/frame mocks exercise enter, frame, exit and re-entry in both mono modes; no Fiber XR loop/listeners, SDK hands remain authoritative, output restored | Use browser XR emulation if available; report emulation versus physical-headset evidence distinctly, never call mocks device acceptance |
| Pointer and hands | Hover/down/move/up/click/miss; target nearest/capture/loss; compatibility mouse dedup; captured-hand echo blocked; input-off policy | Replay baseline mouse and simulated hand pinch/click/drag/miss sequences with identical selection, orbit and release outcomes; exercise a captured target fixture |
| Lifecycle | StrictMode effect replay, tree update, double dispose, pending-config cancellation, repeated mount/unmount, borrowed ownership and HMR replacement | Vite edits do not accumulate canvases/listeners; departure cleanup and persisted-page behavior retained |
| Icon | Icon SDK call advances at most once; normal scene/hands do not contaminate dedicated subject | Capture transparent square icon and load emitted icon.js export without executing main |
| Build and reuse | Isolated frozen dependencies; sample production output and relative asset/icon paths; import-only consumer creates no app; bridge edits invalidate managed output | Serve built app under a nested relative route and inspect errors/assets; import components into a tiny disposable consumer |
| Vanilla | Relevant existing SDK runtime/input/projection fixtures still pass; no React import from SDK entry; no template/UI Kit source migration | Build the unchanged template as a narrow compatibility check if its local toolchain is available |

Before editing Hello Cube implementation, build the vanilla base revision and capture before pictures in the crew task folder. After migration, capture paired after pictures with the same browser/GPU, viewport/DPR, fixed SDK frame timestamp, camera pose, projection, input/selection state and host fixture. Compare mono perspective, mono orthographic, each side-by-side eye, selected/unselected cube states and transparent icon output; include the unchanged template as a compatibility reference where runnable. Inspect side-by-side and pixel-diff images, record any renderer-noise tolerance with its cause, and treat any intentional visual/functional difference as a defect, not a redesign opportunity. Replay the same orbit, click/pinch, drag, miss and projection-transition sequences against both builds and compare results and diagnostics. No new UI controls or visible error/interaction policy changes are part of this task.

Proof pictures and disposable app/server/consumer output stay in the crew task folder, not tracked source. Stop every disposable process before the implementation report. Missing physical display/headset evidence is reported as a known acceptance limitation with the completed mock/emulated coverage, not as a passed hardware check.

## Risks / Trade-offs

- [Fiber runtime assumptions change even within 9.x] -> Pin the current stable version and test configuration, XR entry/exit and renderer/context teardown boundaries; upgrades rerun those contracts.
- [Frame reordering changes existing consumers] -> Add an opt-in component phase only and retain legacy ordering/behavior in targeted regressions. Scene mapping is refreshed after camera-moving component controls.
- [Synthetic pointer and physical-target paths overlap] -> SDK-owned arbitration and source provenance, with cancellation/dedup tests; no second React event listener stack.
- [Asynchronous React commits and GPU disposal] -> Explicit readiness/disposal promises, generation fencing, ownership separation and real effect cleanup tests. Frame-time animation uses refs rather than assuming synchronous React state commits.
- [Source aliases resolve dependencies from core and embedded installs differently] -> Pin compatible dependencies in both owners, deduplicate shared runtimes in Vite, test an isolated sample build and a separate import-only consumer, include bridge in source fingerprints.
- [Hardware unavailable during implementation] -> Exercise deterministic host/XR fixtures and document exactly which browser/emulator/device checks ran; leave no implied physical acceptance.

## Migration Plan

Ship the optional bridge and only the Hello Cube migration together. Vanilla SDK imports and all other app sources remain unchanged. Review the focused regression/build results before any later app/UI Kit migration. Rollback removes the optional bridge adoption and restores Hello Cube's vanilla run entry; it requires no saved-data, manifest-schema or provider migration. Later work can turn UI Kit into a run/export app and add ordinary theme/settings providers on the established component boundary without replacing the SDK runtime.
