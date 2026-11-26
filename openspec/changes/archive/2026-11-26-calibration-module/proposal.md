# Proposal

## Why

The Hands rebuild deliberately preserves camera calibration without a product UI. Restore it promptly as an independent module so people can measure and retain the two-camera transform for later hand providers, without reviving the laboratory.

## What Changes

- Add Calibration to the shared module menu and a core-owned `/calibration/` shell using existing panel components, with concise optional-plugin, native-bridge and two-camera unavailable states.
- Mount the retained injected-port coordinator for manual static-target probes, rigid fitting and held-out validation, and the existing marker workflow; provide explicit camera/profile selection, Start/Stop, previews, quality, Save, Import and Export.
- Preserve workspace preferences and scalar output formats without migration/deletion; document their stable provider-consumption contract and physical verification limits.
- Keep Hands, global adjustments and existing app/provider selection independent; do not add fusion, hand inference, a future provider or removed laboratory tools.

## Capabilities

### New Capabilities

- `camera-calibration`: Independent two-depth-camera measurement lifecycle, manual/marker workflows, result quality and compatible persisted/output contracts.

### Modified Capabilities

- `hands-module`: Replace the pending extraction boundary with the delivered independent Calibration module, still excluding camera actions from Hands.

## Impact

Core panel navigation/routes and a neutral checked optional calibration contribution; the approved embedded input plugin's calibration controller, minimal native packet transport, point sampling, marker collector and revision-safe preferences adapter; targeted fake-port/storage/browser tests and calibration documentation. Base is PR 51 head `a99213573204ce104c2a99316eebb9619f91ed61`; rebase onto `main` after that PR merges. No personal workspace, running panel, profile or projects are used. Hardware acceptance remains operator-required.
