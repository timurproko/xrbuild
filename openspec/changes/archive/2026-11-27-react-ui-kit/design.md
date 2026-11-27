# Design

## Context

See proposal.md for motivation and specs/app-components/spec.md for the contract. Planning starts at origin/main `0704c7956cc5222d993f2494318f866c2e74f40d`, the merged React foundation. Its handoff documents two important regressions already fixed: Mouse-off must not block hands, and stereo emulated-hand picking uses whole-panel centre-viewer rays while native mouse picking uses eye halves. Neither rule is negotiable during this migration.

`packages/react` already supplies mount readiness/disposal, the SDK-owned Fiber root, frame/hands hooks and target/pointer hooks. `packages/ui-kit` exports imperative Button, Switch, Segmented, Slider, Dial, Trackball, Dialog, Label, Icon and GlassEdge. Each Control owns SDK targets; its chainable `on` has no removal. Dialog additionally owns/attaches/updates its Close button. Control classes mix default mesh construction with their established behavioral state machines. Labels own canvas textures, and several meshes/materials are shared inside an instance, so indiscriminate traversal disposal can double-release resources.

The showcase has eleven controls, exact metre-scale positions, no separately drawn board surface, a momentary segmented axis selector and an Interactable switch. Its update clamps delta to 0.1 seconds. Launcher has its own opaque rounded board, glass card dialogs, compact buttons, async icon fallback/loading, polling, reveal/bob/launch animations, native pointer swipe and right-button tilt, and delayed release actions (60 ms, then 1150 ms navigation). Its dialogs are visual card panels, not currently attached as modal SDK blockers; blindly attaching their React equivalents would change picking. The template has animated extruded text, a ring, three lights and standalone icon/theme assets.

Existing showcase/Launcher tests include source-shape assertions against the old main entries. Preserve their behavioral intent and replace obsolete syntax assertions with runtime/tree/API tests rather than deleting contracts. Core and embedded dependencies are separately installed/locked. Managed embedded fingerprints already include UI Kit, React source/manifests and the embedded tree.

## Goals / Non-Goals

**Goals:** Preserve exact defaults while giving each component one explicit owner for construction, SDK attachment, subscriptions, frame updates and disposal. Make importing an app independent of running it. Retain imperative consumers without pulling React into their root import. Preserve all required verification, including the template in this PR.

**Non-Goals:** No new look, interaction tuning, theme selector/context/registry, exposed-settings API or tab, panel UI, other sample migration, native changes, editor, alternate XR runtime or runtime-loaded component sharing. Existing Launcher runtime icon loading is retained, not expanded into component module sharing.

## Decisions

### 1. Thin adapters, optional entry, unchanged imperative API

Add `packages/ui-kit/src/react/index.ts` exposed as `@xr-build/ui-kit/react`. It exports React Button, Switch, Segmented, Slider (including stepped), Dial, Trackball, Dialog, Label, Icon, GlassEdge and Board with typed props/refs. Keep the root entry's class names and React-free dependency graph intact. Source Vite aliases match the React subpath exactly before the root alias, preventing the existing `index.ts/react` prefix-resolution trap.

The adapters instantiate the existing classes; do not reproduce their target thresholds, geometry, easing, sound or grab state machines in JSX. A common adapter owns the commit-time object, stable ref, subscription proxies, SDK attachment and SDK frame callback. Create disposable Three objects only within committed lifetimes, not abandoned render initializers. A stable host group can contain the committed primitive with explicit ownership; do not let Fiber's automatic disposal race imperative disposal. Strict effect cleanup/replay constructs a fresh owned instance, leaving no disposed instance reused.

Preserve chainable `Control.on(type, fn): this`; add `off(type, fn): this` and an explicit disposer-returning subscription method. Listener removal is idempotent and selective. Component callbacks use current-handler refs, so changing a handler neither reconstructs the object nor releases capture. Internal target listeners and Dialog's internal Close subscription have explicit cleanup ownership too. Do not change existing event payloads or normal ordering just to fit React.

Separate construction-only options from mutable props; document constructor inputs as stable for a mounted instance, with a React key for intentional reconstruction. Mutable transform/enabled/visibility, supported existing setters and event callbacks update in place. Initial values stay initial values unless an existing class setter supports an explicitly documented live prop. Refs retain access to existing imperative operations such as dialog open/close and trackball axis without introducing a new settings system.

**Alternative rejected:** Rewrite controls as declarative geometry plus hook-based interaction. That duplicates mature state machines and risks subtle poke/grab/audio/visual differences. **Alternative rejected:** Return unsubscribe from existing `on`. That breaks chainability for imperative callers.

### 2. One lifetime and one update owner

Attach controls directly through their existing `attach(xrb.interaction)` inside the committed lifecycle. Do not also register their targets with `useXrbTarget` or mesh clicks with `useXrbPointer`: the class already owns target event handling. Keep SDK mouse binding and hand mapping authoritative; no new DOM/Fiber event manager, raycaster or per-control binding.

Drive class `update(Math.min(0.1, deltaSeconds))` via `useXrbFrame` once per SDK frame, retaining app-specific delta policy. Never run controls once per stereo eye. Dialog alone updates/owns its Close button, which is not wrapped/attached again. Non-interactive visual primitives need no targets. Board reproduces Launcher's existing authored surface with explicit dimensions/material defaults; it does not add a previously nonexistent panel behind the showcase.

Preserve Launcher's visual-only card Dialog policy through an explicit `interactive={false}` adapter option: update its established appearance but register neither blocker nor Close targets. Showcase Dialog retains normal modal blocking. Compact title/status visibility and disabled hidden XR/Close buttons are applied before input starts.

Teardown fences callbacks/actions first, then removes targets through SDK cancellation, stops owned ongoing work, removes the object and disposes owned unique geometry/material/texture resources exactly once. Keep cancellation cleanup internal even after external callbacks are retired. Add idempotent final disposal distinct from reversible detach; detach remains usable by imperative consumers. Do not dispose borrowed textures, sibling content, the shared audio context or the SDK renderer. Track owned resources explicitly, including label canvases/textures, dynamic slider-fill replacement and nested dialog resources. Normal release semantics remain unchanged; teardown/source cancellation must not schedule a delayed navigation from a retiring Launcher component.

Baseline control visuals currently read preceding interaction state before the next interaction resolution. The React phase is after fresh hand sampling but before resolution, so preserve that visual-lag policy and verify event/animation sequence parity rather than introducing an extra post-input update.

### 3. Default visual construction is a replaceable boundary, not themes

Keep behavior/target dimensions and default visual construction separate inside UI Kit. Extract per-control default geometry/material/colour creation into internal visual builders returning the named parts that existing behavioral updates manipulate. Retain byte-for-byte geometry parameters, material flags, draw ordering and dimensions; behavior still sets press/hover/value transforms on those named parts. Keep animation state, input arbitration and sound outside visual builders. Board and noninteractive primitives follow the same owned-visual convention.

The adapter constructs through this narrow default factory boundary, so a later React context can select a different visual factory for every control, including mesh shape, not merely override a global colour map. This PR introduces no theme selection/provider, alternate theme, public theme schema or global mutable style. Do not generalize into a plugin framework. Existing `theme.ts` helpers/default constants remain compatible. Ordinary props and pure exported scene components leave room for later app settings without metadata registries, persistence or panel changes now.

**Alternative rejected:** Hard-code JSX mesh layouts inside each adapter or expose only a colour override; neither supports later mesh-style replacement without entangling input again. **Alternative rejected:** Build a theme context now; that is expressly deferred.

### 4. UI Kit is both app and public library

Split the showcase into `src/main.tsx` (only bootstrap/mount/lifecycle) and `src/index.ts` (pure exports of `UiKitScene` and the supported controls/props re-exported from the optional package entry). Scene composition uses those React controls rather than an imperative control array hidden behind one component. Preserve exact positions, row ordering, lighting, camera/frustum, background, ArrowRight icon, axis rules, Interactable status and dialog text/lift. Ref/event wiring replaces only the old array wiring. Only bootstrap may set body readiness, own renderer options or manage pagehide/HMR.

Public imports allocate no renderer, canvas, timers, catalog requests or devices. Each mounted scene/control has independent state. Preserve `base: './'`, authored icon entry/output, app manifest and public resources. Keep icon mode on the SDK fast path without ordinary control attachment or visual contamination. Use mount readiness and owned teardown from stage 1, not a second application lifecycle implementation.

### 5. Launcher is a real app-to-app consumer

Give Launcher `src/main.tsx` and a pure `src/index.ts` exporting its scene/card components. Alias `@xr-build/ui-kit-app` to the showcase's public source entry through the selected core. Import Board, Button, Dialog, Label and other shared React primitives from that entry; no private file imports and no local duplicate control construction. Utility geometry helpers can remain package-root imports for app-specific branding, dots, spinner and icon wells; controls themselves must come through the app library export.

Retain existing pure catalog/icon-loader modules and URL contracts. Express catalog, cards and paging as instance-local component composition with stable entry keys. Keep per-frame reveal/bob/icon/spinner/launch transforms in refs on SDK time; preserve baseline animation start timestamps and easing, not render-count-driven React state. Catalog refresh and discrete state commits must be covered against the baseline so a re-render cannot reset reveal/launch timers or cancel a held card. Keep active content material transparency and glass/backdrop rendering identical.

Install tilt/swipe DOM listeners in cleanup-safe effects with their existing capture phase, buttons, thresholds and SDK capture checks. Own/clear polling, AbortControllers, 60 ms release timers and 1150 ms launch timers; generation-fence late icon/catalog results and dispose retired assets. Keep catalog mounting lazy: importing the public Launcher entry performs no I/O. Preserve empty/error/recovery states, placeholder cards, XR availability visibility, explicit enter action and local/published routing. No network origin or publication defaults are added.

**Alternative rejected:** Wrap the old monolithic Launcher bootstrap as one React primitive. It would not make Launcher a consumer of exported React UI Kit controls, and would retain global state/listener leaks.

### 6. Canonical template and build-time reuse

Generate `src/main.tsx` plus `src/index.ts` and a pure scene component module. Retain the name/package placeholders, font loader/text bevel and centering, lights, material/renderer/DPR policy, ring, animation formulas, icon.js, icon-theme.js and font notice. Keep bootstrap outside exports, follow established HMR/pagehide disposal and add the React Vite transform/source aliases/deduplication. A plain new app remains immediately runnable through the panel; existing user source is not migrated.

Use stage-1 pinned React 19.3.1 / Fiber 9.8.2 versions and compatible pinned JSX tooling in the owning core/embedded packages and locks; keep the separate workspaces separate. Consumers deduplicate `three`, `react`, `react-dom`, `@react-three/fiber`. Exact alias entries precede root aliases. The showcase app export is bundled by Vite, not imported remotely, and does not need another distribution/runtime registry. Test isolated frozen builds rather than relying on installed pool dependencies. Extend production JSX/type includes and build-input regression coverage where new entries require it; the existing fingerprint design should already cover all sources, so no unrelated backend redesign is planned.

Document two concrete examples: import an exported UI Kit control into Launcher; import a generated app scene into a second disposable consumer. Explain pure entry versus run entry, peer/runtime deduplication, stable construction props, ownership, normal React providers and relative assets. Update stale stage-1 statements that template/UI Kit remain vanilla, while retaining vanilla support.

## Verification plan

Planning does not claim any implementation evidence. Before changing implementation, capture the current baseline in this same checkout, then retain immutable built output and proof outside the checkout in the crew task folder. Use the same browser/GPU, viewport 800 x 450, DPR 1, exact camera poses/frusta, fixed SDK frame timestamps/deltas and deterministic host/catalog/icon fixtures on both revisions. Freeze performance-derived animation start times and async asset completion too; matching only the frame timestamp is insufficient for Launcher. Generate the same template name/theme both times.

| Area | Required comparisons and targeted coverage |
| --- | --- |
| Pictures | UI Kit, Launcher and generated template in mono perspective, mono orthographic and full side-by-side stereo (both eyes); compare PNG bytes and decoded pixel diffs. Include initial/settled states, dialog open, disabled controls, active slider/axis, Launcher paging/reveal/loading/launch states and icon output. Start with zero tolerance; any tolerance must have a measured, reproducible renderer-noise cause and bounds, never intentional design drift. |
| Mouse replay | Hover, press/release, miss, drag, track jump, slider steps, dial, all trackball axes, segmented selection, switch, dialog Open/Close/occlusion and Interactable disable/re-enable. Launcher previous/next/end pages, drag paging, right-button tilt/reset, open-after-release and XR action; template/runtime defaults. Compare event ordering, sources, values, transforms and action timestamps. |
| Hand replay | Every interactive control via physical poke/pinch/volume targets, slider touch and pinch, tracking-loss/release/disable, dialog occlusion and blocked background. Replay with Mouse on and off in both mono projections and stereo, including off-centre stereo positions and captured-hand emulation deduplication. Exercise Launcher paging/open using hands and Mouse-off. Native mouse must remain inert when disabled. |
| Lifecycle | Real React/Fiber tests with SDK/renderer/input fixtures: StrictMode, handler changes while held, keyed reconstruction, unmount while held, dialog nested ownership, double disposal, pending/late work, two instances, borrowed assets and HMR; no residual targets/listeners/timers/draw loops or repeated disposal. |
| Import/build/icon | Frozen core/embedded dependencies, targeted strict production types, production builds of both apps and generated template, nested relative-route asset checks and standalone icon.js imports. A tiny import-only/mounted consumer for each public app entry demonstrates no bootstrap side effects and one runtime. Preserve font/icon notices and template substitution. |
| Existing boundaries | Keep relevant SDK input/runtime, React bridge, UI Kit sound/control, showcase layout/publication, Launcher catalog/loading/icon/publication and generated-project contract tests passing. Replace syntax-only main-file assertions with equivalent behavioral checks, not weaker checks. Include an imperative import/build proving React stays optional. |

Planned local commands are package-local UI Kit/React tests, selected SDK interaction/pointer/runtime test files, app-local UI Kit and Launcher tests/builds using `XRB_CORE`, isolated generated-template/consumer builds, the specific template/fingerprint tests, strict public production types, name guard and OpenSpec validation. New TSX tests use the existing pinned runner/aliases rather than Node type stripping. The report will record exact commands/counts, artifact paths/hashes, matched picture pairs and input traces. Do not run the root full test suite locally; CI retains broad integration coverage. Hardware acceptance is separate: deterministic browser/host/hand replay is not a physical tracker/display/headset pass.

All proof pictures, baseline builds, disposable consumers, logs and PR-body scratch stay in `C:/Users/tprokopiev/.crew/tasks/react-ui-kit`, as this task explicitly requires. Stop all disposable servers/apps before report handoff. No verification category is dropped if implementation becomes difficult; any actual blocker is reported rather than called acceptance.

## Risks / Trade-offs

- [Subtle behavioral or visual drift from a wrapper] -> Reuse classes, retain target/animation ordering, capture before implementation and compare identical frame/input sequences with zero intentional differences.
- [Strict replay leaks constructor resources or disposes live objects] -> Commit-owned construction, reversible detach versus final disposal, explicit unique-resource ownership and double-mount/borrowed-resource tests.
- [Dialog gains a blocker in Launcher or Close updates twice] -> Explicit visual-only card policy and one owner for nested resources/targets/frame work.
- [React state/timers reset live catalog/card interaction] -> Stable keys and refs, owned/fenced async work, baseline timing/event traces and held-refresh regressions.
- [Cross-app aliases resolve different runtimes or stale builds] -> Exact subpath aliases, common runtime dedupe, isolated frozen builds and managed fingerprint regressions.
- [Preparing for themes expands into a theme feature] -> Extract only the default visual-builder boundary; no provider, schema, alternate visuals or setting controls.
- [Physical hardware unavailable] -> Full deterministic replay and stereo fixtures remain required; state the unperformed device acceptance explicitly.

## Migration Plan

Deliver in five outcomes: controls/lifetimes; showcase/run/export; Launcher consumer; template/run/export; reuse documentation and regression/build fixtures. Capture all three baselines before editing implementation, integrate checks into each outcome, and complete the full matrix before final implementation handoff. This is the full requested scope; no template deferral is proposed. The optional React entry preserves imperative applications. Rollback restores affected run entries/template and removes React adoption, without saved-data, provider or publication-schema migration. Later theme and exposed-settings tasks build on the visual/props boundaries, not on a new runtime.
