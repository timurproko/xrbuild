# Proposal

## Why

The post-processing component still requires Save/Reload and renders number settings without the paired sliders or section reset menu used by other Hands controls. The merged mesh service already supports live configuration and generation acknowledgements; the editor must use that boundary without confusing saved values with applied settings.

## What Changes

- Render only the selected plugin's declared settings: labelled number-plus-slider rows, select dropdowns and boolean switches, with a Post-processing gear menu containing Reset to defaults.
- Save valid finished edits, plugin selection including None, and section resets immediately through revision-safe post-processing writes. Preserve unfinished edits, other plugins' saved values, source and adjustments; expose explicit conflict recovery.
- Show compact status beside the controls using the existing run identity, saved revision and requested/applied generation. Show Preparing and bounded progress when supplied, failed reasons with Retry, and Applied only for the acknowledged desired generation; never equate application with drawing.
- Keep the selector hidden only when no plugin is installed. Preserve missing/unavailable identity and legacy relaunch guidance, without plugin-specific behavior or names.
- Cover generic rendering, commit timing, concurrency and delivery races with fake-only tests and before/after light/dark normal/narrow pictures after implementation approval.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `hands-module`: Declaration-driven post-processing controls, finished-edit persistence, section reset and acknowledgement-fenced inline delivery feedback.

## Impact

Implementation is limited to `packages/control-panel/ui/hands-postprocessing.js`, post-processing-scoped styles in `ui/hands.css`, and corresponding tests/fixtures under `packages/control-panel/test/`. Planning artifacts live in this OpenSpec change. Existing GET/PUT `/api/hands/postprocessing` and POST `/api/hands/postprocessing/retry` remain the API boundary, with no protocol, dependency or stored-profile migration.

The parallel Hands mesh-session/viewport work owns acquisition, runtime wiring and consumer status production. This change does not edit session, viewport, SDK, server or rendering code, and does not claim standalone Hands delivery until its owner actually supplies matching evidence. Browser previews, published web builds and offline packages remain excluded. No runtime/model installation, real-camera operation or writes to personal state are included.
