# Proposal

## Why

Hands should be one simple hand-pipeline page, not a source-settings card plus a separate laboratory. Keep only calibration and recording/replay from the old viewer, preserving their existing data while removing generated and laboratory features from both UI and code.

## What Changes

- One core `/hands/` page: large 3D hand view, global provider picker, post-processing selector mount, Position and size / Appearance from PR 50, calibration and recorder. Reuse existing components and header fps chips with a minimal tab layout.
- Keep the shared SDK/profile adapter and Source session action slot stable for the separate live-provider task. No fixture or automatic source substitution; the view is honestly idle until a real session supplies frames.
- Delete the separate diagnostic identity/page and all old page routes without redirects. Remove generated fixture delivery/scenarios/tests/targets, browser hand-landmark acquisition, depth-hand surface reconstruction, fusion, benchmarks and other laboratory workflows/code, except dependencies demonstrably required by retained calibration or recording compatibility.
- Preserve camera-to-camera calibration as a narrowly scoped measurement/export utility. It needs two native RGB-D camera identities/profiles, calibration-only capture, markers or manual static-target depth probes, rigid fitting, checked persistence and import/export. Its result does not adjust app hands; the removed fusion engine was its runtime consumer.
- Preserve readers/playback and original-coordinate provenance for existing pose CSV, RGB/depth and paired recordings without keeping their old analysis/fusion engines. New recording of the selected provider is a live-provider dependency, not a capability of today's camera recorder; do not present a working Record action before a compatible stream is connected.
- Keep all existing workspace calibration/preferences/recordings and exported files valid/readable. No automatic migration/deletion and no personal-state changes in tests.
- Post-processing behavior is owned by its separate task; this page supplies its selector mount only. The separate task's first hand-mesh processor does not require a new processor system here.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `hands-module`: sole minimal provider/profile page with retained calibration/recording compatibility, explicit live-recording dependency and actual removal of obsolete laboratory code/routes.

## Impact

Core panel shell/navigation/SDK view; optional calibration capture boundary; retained recording/calibration format/storage helpers; public plugin component/build references and tests. No private-source edits, user-data cleanup or post-processing/live-provider implementation in this change. See design.md for the source-backed dependency findings and the incompatible recorder semantics that require coordination before completing implementation.
