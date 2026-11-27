# Tasks

## 1. UI Kit React controls preserve behavior and release owned resources

- [x] 1.1 Before implementation edits, retain baseline production builds, deterministic camera/clock/viewport/catalog fixtures, pictures and mouse/hand traces for UI Kit, Launcher and a generated template in the crew task folder; check hashes and coverage of mono perspective, orthographic, stereo and icon states against the design matrix.
- [x] 1.2 Add chain-compatible listener removal, disposer-returning subscriptions and idempotent owned-resource disposal to controls/primitives; focused imperative tests cover selective unsubscribe, repeated detach/dispose, held cancellation, dynamic geometry, nested dialog resources and borrowed-resource survival.
- [x] 1.3 Separate default visual builders from unchanged control behavior/targets without implementing themes; compare geometry/material parameters and baseline control pictures, and keep existing imperative control/sound tests passing.
- [x] 1.4 Export typed optional React components for Board, Button variants, Switch, Segmented, Slider variants, Dial, Trackball, Dialog, Label, Icon and GlassEdge; real component tests cover commit-owned construction, SDK-only attachment/frame work, mutable props, stable callback updates and the React-free imperative root import.
- [x] 1.5 Cover StrictMode, HMR/replacement, two instances, unmount/disable while captured, no post-cleanup callbacks, once-per-frame stereo updates and Dialog's single nested owner with focused lifecycle tests and resource/registration counts.
- [x] 1.6 Replay every interactive control with mouse and physical hands in mono perspective, orthographic and stereo, including Mouse-off native exclusion, off-centre stereo hands and capture/emulation deduplication; compare baseline events, sources, values and visual feedback.
- [x] 1.7 Document the optional entry, refs, stable construction options, live props, subscriptions and resource ownership in the UI Kit package guide; run the focused package tests and strict affected production type checks with the owning dependency/lock updates.

## 2. UI Kit showcase runs and exports reusable React components

- [x] 2.1 Replace the showcase imperative composition with exported scene/control components and separate main.tsx/index.ts entries; runtime tree/layout tests retain all positions, row order, lighting, axes, Interactable behavior, dialog and absence of extra board geometry or UI.
- [x] 2.2 Preserve SDK camera/frustum, renderer settings, icon fast path, readiness and clean HMR/pagehide disposal; focused tests cover targets, nested ownership, runtime teardown and standalone icon export without mounting the normal scene.
- [x] 2.3 Configure exact React subpath/source aliases, dependency deduplication, app export metadata and pinned embedded dependencies/lock; frozen app build and import-only consumer tests prove one runtime and no bootstrap side effects.
- [x] 2.4 Preserve showcase publication/headset contracts and update obsolete source-shape assertions to behavioral component tests; app-local checks and paired before/after mono, orthographic, stereo, dialog/disabled and icon pictures plus mouse/hand traces match the baseline.
- [x] 2.5 Update the showcase README with run/export usage and its public control entry; build the documented consumer import and retain existing manifest/assets/output behavior.

## 3. Launcher composes the UI Kit app's public React exports

- [x] 3.1 Export instance-local Launcher scene/card components with a separate run entry; build-time imports of shared Board, Button, Dialog and Label come from the UI Kit app public entry, proven by public-API and import-only tests rather than private source imports.
- [x] 3.2 Preserve board/card dimensions, lights, compact controls, transparency, branding, icons, dots and spinner; runtime tests cover visual-only card dialogs with no new blocker and paired fixed-clock pictures retain initial/settled, paged and launch states in all view modes.
- [x] 3.3 Retain catalog routing/order/refresh/errors, icon fallback and late-load handling, release/navigation timing, return/projection URLs and explicit XR availability; focused existing and new tests cover refresh during interaction, cancelled/unmounted delayed actions and late-result disposal.
- [x] 3.4 Recreate swipe/tilt and frame animations through owned effects/SDK frames with exact thresholds, capture phases, timing and easing; baseline mouse/hand replays cover paging, tilt/reset, launch, Mouse-off and stereo hand selection without duplicate actions.
- [x] 3.5 Own and clean DOM listeners, polling, fetch aborts, timers and icon resources; lifecycle/HMR tests prove no surviving work after removal, and app-local production/publication/icon tests preserve relative routes and standalone output.
- [x] 3.6 Update Launcher build aliases/dependencies/lock and README for its UI Kit app import and exported scene; frozen production build and a separate consumer bundle prove no showcase bootstrap or second runtime.

## 4. New app template generates a runnable React component library

- [x] 4.1 Produce main.tsx, a pure scene component and public index.ts while retaining name/package substitution, text geometry/centering, material/lights, ring animation, renderer/DPR defaults, icon/theme assets and notices; generated-project tests inspect and mount the resulting app.
- [x] 4.2 Add pinned React/JSX build tooling, exact source aliases and runtime deduplication to template configuration; isolated generated app and component-consumer production builds pass without modifying existing user projects.
- [x] 4.3 Retain standalone icon.js output and clean runtime/HMR/pagehide ownership; targeted template/project/icon contract tests and import-only checks show no public-entry side effects or asset regressions.
- [x] 4.4 Compare generated-template before/after pictures in mono perspective, orthographic, stereo and icon mode at identical clock/camera/name/theme and replay its mouse/hand/runtime defaults; record exact matches or justified renderer-noise bounds.
- [x] 4.5 Document template run/export shape and example source consumption, updating stale vanilla-template statements; execute the documented build/import steps and keep font/license resources intact.

## 5. Cross-app reuse and regression fixtures preserve the migration contract

- [ ] 5.1 Add cross-app import-only and mounted-consumer integration fixtures for UI Kit, Launcher and generated scene exports; production bundles show shared runtime deduplication, relative assets, independent instances and no executed foreign bootstrap.
- [ ] 5.2 Extend only affected managed-input/JSX/type integration checks as needed; targeted fingerprint tests show component/entry changes invalidate managed outputs, and isolated frozen installs/builds do not rely on pooled dependency state.
- [ ] 5.3 Finish developer/root documentation linking the delivered package/app guides and explaining app-to-app source aliases, visual-builder boundaries and deferred themes/settings; build the cross-app examples as written.
- [ ] 5.4 Complete the full design verification matrix across all three apps, every control, both input paths, Mouse-off and off-centre stereo hands; retain paired PNG hashes/pixel diffs and event/state/timing traces with zero intentional visual or behavior changes.
- [ ] 5.5 Run only relevant SDK/React/UI Kit/app/template integration tests, production types, name guard and OpenSpec validation; record exact commands/results and known hardware limits, and stop every disposable app/server before implementation handoff.
