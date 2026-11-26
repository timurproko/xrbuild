# Tasks

This is the page-only first delivery from design.md, with no fixture mode or native provider session. Task groups correspond one-for-one, in order, to the PR Implementation outcomes. The live-provider follow-up is intentionally not an outcome in this PR.

## 1. Core Hands three-column surface

- [ ] 1.1 Replace the core source-card page with the shared left/viewport/right topology, Hands title and header fps chips; verify core shell/navigation tests and the default Source + Adjustments selection.
- [ ] 1.2 Add Source/Post-processing and Adjustments/Output/Stats tabs using existing components, preserving mounted form state across tab changes; verify keyboard navigation and responsive/default-size overflow checks.
- [ ] 1.3 Add viewport View, scene Reset and fullscreen controls without fixture controls or targets; verify scene changes never submit profile/source writes and fullscreen/resize lifecycle disposes correctly.
- [ ] 1.4 Redirect old Hands/diagnostic page aliases before tool dispatch and remove the old page link/title from active navigation; verify GET/HEAD redirects and navigation regressions, and document the canonical route and first-delivery idle limitation.

## 2. Global provider selection and honest idle state

- [ ] 2.1 Mount the existing global provider picker first in Source with availability, purpose/reason, explicit Save/Reload and missing-source retention; verify current revision/conflict and no-silent-fallback cases.
- [ ] 2.2 Show distinct source, viewport-idle and Previous app session status with next-launch-only help; verify opening an app or receiving historical status does not imply frames in this view.
- [ ] 2.3 Remove all Local fixture/Fixture/Pause/Restart/generated-preview entry points; verify no such controls or automatic Synthetic selection exist and installed Synthetic remains only an ordinary provider option.
- [ ] 2.4 Keep the full core page available with the optional input plugin/build absent and with empty/missing providers; verify isolated browser requests start no jobs, media/XR acquisition, runtimes or profile writes, and document the missing-plugin behavior.

## 3. Shared SDK/profile view and existing adjustment controls

- [ ] 3.1 Add the minimal allowlisted core SDK/three.js/orbit browser module closure and source-neutral empty-frame-capable viewport adapter; verify module loading without optional plugin assets and rejection of unallowlisted paths.
- [ ] 3.2 Route admitted frames through the existing SDK ingress/profile/filter/gesture/scene/standard-visual path with no diagnostic rawOptions; verify app-pipeline parity, one geometry transform, profile readiness and clear/reset/dispose with fake transport inputs, not a product fixture mode.
- [ ] 3.3 After PR 50 merges, update from main and mount its delivered self-contained Position and size / Appearance component together in Adjustments; verify its independent resets, one explicit Apply, dirty-tab persistence, source-Save independence and conflict/delivery status without duplicating schema or controls.
- [ ] 3.4 Connect the viewport to the same applied validated profile snapshots and reset semantics; verify geometry changes clear old SDK state, appearance changes affect drawing only and invalid profile state stays actionable without overwrite.
- [ ] 3.5 Provide the one-sentence Post-processing empty state, generic Output/Stats and actual render fps with unavailable tracking metrics while idle; verify no plugin loader/setup action, fabricated rate, frame producer or synthetic-only target is introduced, and document the adapter's future session seam.

## 4. Diagnostic UI retirement without data loss

- [ ] 4.1 Remove the optional diagnostic tool registration and associated service/component references while keeping its native provider declaration; verify plugin discovery, source availability and product navigation no longer expose or initialize that tool.
- [ ] 4.2 Leave camera landmarks, RGB-D capture, markers/calibration, reconstruction, fusion, benchmarks and recording/replay code unmounted/unreachable; verify retired asset/API/tool-start requests cannot activate handlers and document every disposition plus existing data paths.
- [ ] 4.3 Preserve existing plugin preferences/calibration/models/recordings/exports and caches; verify byte-identical pre-seeded workspace data after page navigation and source/adjustment writes, without migration, deletion or touching user projects.
- [ ] 4.4 Exercise the final page in an isolated panel/workspace/browser profile and capture default-window-size screenshots of initial Source/Adjustments, Post-processing, Output/Stats and missing-plugin states in the allowed task output folder; record actual dimensions, no-acquisition assertions and supplementary narrow/theme checks, then stop every owned instance before handoff.

## Workflow follow-up

- Stop after this plan-only draft PR until implementation is explicitly approved.
- Recommend the immediately following separately approved 5–8 engineer-day real-provider session PR from design.md: headless Start/Stop, exclusive lease, authenticated transport and real-hand interaction targets using the same viewport/profile.
- Do not claim live tracking or new-page screenshots at planning time; the first delivery is explicitly idle and approximately 3–4 engineer-days after adjustment integration becomes available.
