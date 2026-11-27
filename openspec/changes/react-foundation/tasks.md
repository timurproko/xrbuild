# Tasks

## 1. Optional Fiber bridge shares SDK frames, projection and owned-resource lifecycle

- [ ] 1.1 Add the optional React source package and compatible pinned React 19/latest stable Fiber 9.x dependencies, keeping vanilla SDK imports React-free; verify package export resolution, frozen core installation and the new package's targeted type check.
- [ ] 1.2 Add an opt-in SDK component phase after current hand sampling and before interaction/drawing, carrying the SDK clock and current XRFrame; verify existing vanilla frame order plus new sample/component/interaction/draw ordering with focused SDK runtime tests.
- [ ] 1.3 Configure a custom Fiber root with the SDK scene/camera and guarded renderer/XR facade, never Canvas; verify one root advance and one SDK submission per frame, no independent RAF/raw draw, and preserved size/DPR/camera identity across mono projection, stereo and resize fixtures.
- [ ] 1.4 Implement mount readiness, update and idempotent asynchronous disposal with owned versus borrowed runtime boundaries and generation fencing; verify real React StrictMode effect replay, repeated mount/unmount, setup failure/cancellation, borrowed context survival and HMR replacement tests.
- [ ] 1.5 Cover XR entry, exit and re-entry plus icon mode using focused bridge/SDK tests; assert no Fiber session listeners or loop writes, no doubled component updates, restored SDK dimensions and correct icon draw ownership.
- [ ] 1.6 Document every new mount/handle API, frame phase, ownership rule and supported Fiber integration limit in the React package and SDK README; verify examples compile and the focused bridge suite passes.

## 2. Documented React hooks use SDK hands, picking and target capture without duplicate input

- [ ] 2.1 Add typed SDK/frame/hand context hooks using the shared Fiber advance; verify current processed and scene hands, common frame time/delta, restart behavior, out-of-context errors and cleanup in focused hook tests.
- [ ] 2.2 Add the optional SDK mesh-pointer registration route to authoritative mouse picking without a second DOM event manager; verify hit/miss, hover/down/move/up/click, parent propagation, both stereo halves and mono orthographic rays in targeted SDK input tests.
- [ ] 2.3 Add cleanup-safe component pointer and physical-target hooks with current callback refs; verify target nearest arbitration, held capture, disabled/removed/lost reasons and StrictMode replay with real React fixtures.
- [ ] 2.4 Carry internal emulated-hand provenance and cancellation through the SDK route and suppress captured-hand mesh echoes without changing vanilla DOM behavior or gesture thresholds; verify one activation for pointer/compatibility input, input-off policies, and no click after cancellation/profile reset.
- [ ] 2.5 Document every new hook and event payload, the supported event subset, frame-readable hand semantics and callback ownership; verify examples and focused pointer/interaction/hand compatibility tests.

## 3. Hello Cube runs and exports identical components with compatible source-alias builds

- [ ] 3.1 Before changing the sample, build its vanilla baseline and record matched viewport/clock/camera/input fixtures, pictures and interaction sequences in the crew task folder; verify reference captures cover mono perspective/orthographic, stereo eyes, selected states and transparent icon output.
- [ ] 3.2 Rebuild only Hello Cube scene content as reusable TSX components and move bootstrap into main.tsx with a side-effect-free src/index.ts export; verify exact geometry, transforms, materials, lighting, grid, rotation, stats, orbit/selection behavior and cleanup against the original fixtures.
- [ ] 3.3 Preserve the relative base, app manifest/output and standalone icon.ts/dist/icon.js contract, adding only the React development transform/source aliases and needed dependency metadata; verify isolated frozen embedded installation, targeted sample tests and production build.
- [ ] 3.4 Deduplicate graphics/React/Fiber dependencies across core source aliases and embedded consumers, include the bridge in managed build-input fingerprints and public JSX/type coverage; verify a small import-only consumer build creates no app/renderer and a bridge edit invalidates output in the targeted backend regression.
- [ ] 3.5 Capture and compare paired before/after pictures and replay identical input sequences with fixed framing and frame time; verify no intentional visual or functional difference, recording any justified renderer-noise tolerance and keeping all proof/diffs outside tracked source.
- [ ] 3.6 Exercise the design verification matrix for projection, stereo, XR transitions, picking, icon, lifecycle and nested-route production loading; report mock/emulator/device coverage separately and stop every disposable server/app afterward.
- [ ] 3.7 Update root/development/SDK/sample documentation with the new opt-in run/export pattern, all API labels and exact source-alias build commands; verify unchanged template and representative vanilla/UI Kit compatibility through focused builds/tests, no source migration, and strict OpenSpec validation.
