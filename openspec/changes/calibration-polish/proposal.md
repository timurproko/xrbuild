# Proposal

## Why

Calibration shows redundant loading copy and misaligned controls, while its generic native prerequisite error hides the recovery action. Distinguishing component preparation from the separately provisioned device bridge will make unavailable capture understandable without touching user state.

## What Changes

- Remove the purpose line in every page state and replace the loading sentence with the existing panel loading indicator.
- Align Start with the Method control at the same baseline and height using shared controls and layout.
- Replace vague capture availability with concise cause-specific notices and applicable existing actions, including Rebuild for recoverable application components.
- Trace missing/disabled contributions, missing or stale bridge output, service dependencies and device-runtime failures; fix any normal Rebuild recovery gap without implicitly provisioning optional device dependencies.
- Document what the operator must do and what remains hardware-unverified; preserve passive navigation and stored-result operations.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `camera-calibration`: remove the mandatory purpose line, require standard loading/control alignment and actionable prerequisite-specific availability.

## Impact

Calibration shell and browser mount, optional calibration capture/runtime diagnostics, checked component resolution and existing Rebuild integration where required; focused regression tests and calibration documentation. No calibration format, acquisition policy, user preferences, projects, device SDK installation or new visual system changes.
