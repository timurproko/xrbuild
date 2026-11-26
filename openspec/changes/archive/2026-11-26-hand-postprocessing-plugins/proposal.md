# Proposal

## Why

Hands needs one optional plugin that adds a mesh from the final processed skeleton, regardless of the selected provider. Apps should draw that mesh automatically without changing joints, gestures, interaction or app code.

## What Changes

- Discover installed geometry-only sidecar plugins from versioned metadata, without importing code or downloading anything.
- Save None or one selected plugin and its few settings in the existing global Hands profile; changes apply on the next desktop app run.
- Supervise that plugin during panel-managed desktop runs and asynchronously feed it the final sampled skeleton. Missing, late or failed processing visibly falls back to the skeleton without delaying interaction.
- Draw valid mesh output through standard SDK hand drawing, respecting appearance and visual opt-out.
- Add a small independently mounted Hands selector with settings/status beneath it and the notice: "Post-processing is used only in desktop apps run from this panel, not browser previews, published web builds or offline packages."
- Use one fake sidecar plugin only in tests. The actual mesh plugin remains a separate later task, dependent on its feasibility experiment; core contains no concrete implementation names or logic.

## Capabilities

### New Capabilities

- `hand-postprocessing`: one optional mesh sidecar, global selection, bounded asynchronous results and standard drawing.

### Modified Capabilities

- `hand-input`: optional mesh output never changes or delays the existing hand input path.
- `hands-module`: simple global post-processing selector, plugin settings and truthful status.

## Impact

Plugin metadata/catalog, the existing Hands profile transaction, desktop run supervision/metadata, SDK post-sample dispatch/standard drawing and a root-scoped UI component. Reuse PR #50 adjustments/profile ownership after it lands; do not replace its transform or live Apply. Browser preview, publication and offline packages continue skeleton-only and do not fail because of this selection.

## Scope boundary

This replaces the earlier broad plan: no skeleton refinement, multiple-stage ordering, bypass policy, in-process adapter, required-processing startup gate, live plugin reconfiguration, deployment support/refusal system or generic extension framework. Delivery order is declaration/profile, desktop sidecar, SDK drawing, then selector/integration. The reduced mechanism is one reviewable PR; no real processor, model/runtime installation, hardware or page redesign is included.
