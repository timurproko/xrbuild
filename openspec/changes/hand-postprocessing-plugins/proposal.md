# Proposal

## Why

Hands needs separately installed post-processing stages without changing skeleton providers or requiring app-specific integration. A neutral, bounded pipeline must support future fitted hand surfaces while keeping interaction safe when processing is unavailable, late or broken.

## What Changes

- Add versioned `handStages` declarations to `xrb-plugin.json` and origin-qualified metadata-only stage discovery; no importing code, runtime setup or downloads during discovery.
- Extend the existing workspace-global Hands profile with ordered enabled stages, version-bound settings and explicit skeleton bypass consent; preserve source, adjustments and unknown data through the existing transaction.
- Add SDK-owned skeleton refinement before the shared adjustments/filtering and asynchronous geometry enrichment after final pose sampling, with exact no-stage compatibility, bounded work, deadlines and epoch fencing.
- Add run-owned authenticated loopback sidecars for managed native runs, with readiness, cancellation, crash handling, deterministic cleanup and no capture-callback or render-thread inference.
- Add a common optional geometry accessor and standard mesh drawing that obeys visual opt-out and global appearance, without changing the 21-point interaction API or native hand ABI.
- Reject enabled pipelines in unsupported preview, publication and offline-package contexts before execution/output; do not silently remove stages.
- Add an independently mountable Post-processing component to Hands with installed stages, switches, order, schema settings, status and a one-sentence empty state. Do not redesign the concurrent Hands-page work.
- Exercise both execution adapters using inert test-only stages; ship no actual processor, model, runtime installer or provider change.

## Capabilities

### New Capabilities

- `hand-postprocessing`: neutral stage declaration, global pipeline snapshots, bounded SDK execution, supervised sidecar protocol and optional geometry.

### Modified Capabilities

- `hand-input`: explicit processing between source ingress and common interaction/drawing, preserving unchanged provider data and no-stage compatibility.
- `hands-module`: discoverable Post-processing controls and independent revision-safe next-session pipeline editing.

## Impact

- SDK: `hand-source.ts`, final sampling in `index.ts`, profile/control and launch metadata, new processor/geometry modules, standard visual lifecycle and targeted tests.
- Panel: plugin metadata/catalog, global Hands transaction, run preparation/host runner, authenticated runtime delivery/status, staging/publication guards and a self-contained UI component.
- Native host: neutral runtime descriptor/readiness controls and startup hand gate only; no processor implementation or change to provider binaries, HANDS v1/v2 or the 456-byte hand layout.
- Dependency: build on merged PR #48 and integrate the profile/delivery work in PR #50 after it lands; do not reproduce its transform, writer or acknowledgement path. The Hands-page worker mounts the component independently.
- Update public neutral contract documentation and OpenSpec. No private checkout, user's running panel/profile/projects, hardware, tracking runtime or model downloads are required.

## Reviewable delivery

The full request is larger than a comfortable first implementation PR. Recommended cut if the maintainer chooses a split: first land declaration/registry, profile persistence, the independent settings component and refusal guards, clearly labelled next-session configuration with execution unavailable. Then land the SDK/geometry path, then native sidecar supervision and end-to-end managed-run readiness. No intermediate slice may claim that enabled stages run or silently bypass them. This planning PR retains the full requested scope; reducing its outcomes or opening follow-up implementation PRs requires explicit approval. Detailed order and cut boundaries are in design.md.
