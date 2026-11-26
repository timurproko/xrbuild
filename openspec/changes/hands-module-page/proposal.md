# Proposal

## Why

Hands currently opens a source settings card while the useful three-column viewing layout lives in a separate acquisition tool. Make that layout the Hands module itself, centred on the selected provider and shared application pipeline, without generated fixture modes or a competing diagnostics page.

## What Changes

- Replace the core `/hands/` card with a Hands-titled left-panel / large 3D-view / right-panel layout, shared tabs and render/tracking fps chips.
- Put the global provider picker first in Source, preserving availability, reason, explicit source Save/Reload, revision checks and next-launch semantics.
- Remove Local fixture delivery, Fixture choices, generated animation, fixture Pause/Restart and fixture-only targets. Synthetic is only an ordinary installed provider choice, never an automatic preview or fallback.
- Use an honest empty viewport until a real provider session can supply frames; distinguish selected-provider status, previous app status and viewport status. This page-only first PR does not start or observe app tracking.
- Host the shared SDK pipeline and the reusable Position and size / Appearance sections from PR 50, including explicit Apply; expose an honest one-sentence Post-processing empty state without building a plugin system. Retain generic Output and Stats, without fabricated measurements.
- **BREAKING**: remove the separate acquisition diagnostic page, name and navigation link; redirect its old page routes to `/hands/`. Remove camera/depth, markers/calibration, reconstruction, fusion, benchmark and recording/replay workflows from product UI while leaving their implementation unreachable and preserving all user data.
- Recommend an immediately following, separately reviewable live-session PR: explicit provider Start/Stop outside an app, exclusive acquisition lease shared with app launches, authenticated bounded frame transport and shared SDK rendering. The design specifies the seam and estimates both deliveries; it does not promise live tracking in the first PR.

## Capabilities

### New Capabilities

None. This is a replacement of the existing Hands surface, not a second hand module.

### Modified Capabilities

- `hands-module`: three-column provider-centred surface, no fixture mode, honest idle/shared-profile viewport, adjustment integration and retirement of the separate diagnostics UI.

## Impact

- Core panel Hands HTML/JS/layout, navigation, route aliases, source/profile API consumers, read-only browser SDK module serving and focused browser/server regressions.
- Existing SDK ingress, filtering, scene mapping and standard drawing; no alternate raw diagnostic processing path, native ABI change or acquisition lifecycle work in this first PR.
- Optional public input plugin tool declaration/registration and diagnostic documentation; its native provider registration stays intact. No private workspace or user project edits.
- PR 48 is merged. PR 50 is open at planning time and owns adjustment storage, transforms, delivery and relocatable UI; this change mounts those sections after it merges rather than implementing them again.
- First PR: approximately 3–4 engineer-days after adjustment integration is available. Immediate live-session follow-up: 5–8 engineer-days, excluding hardware acceptance and review queues. See design.md for exact layout, feature disposition, dependencies and isolated validation.
