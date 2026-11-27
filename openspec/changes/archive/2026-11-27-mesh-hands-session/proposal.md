# Proposal

## Why

Hands already owns live skeleton acquisition but has no mesh consumer, while managed apps drop almost every fast-motion mesh under the uncompensated 33 ms / 10 mm guards. Connect the existing contained optional service to Hands and re-anchor valid geometry to the current sampled hand without changing input or interaction.

## What Changes

- Give each explicit Hands session an optional mesh gateway and pinned initial selection/settings; reuse existing configuration acknowledgements, preparation, process containment and verified cleanup. Committed None/plugin/settings changes apply to the current consumer without another acquisition lease.
- Feed the Hands viewport's final sampled pose into the SDK mesh client and visual, with profile, identity, generation and topology invalidation and complete session disposal.
- Compensate delayed mesh geometry every render frame using the source-to-current rigid wrist translation and orientation. Replace raw displacement rejection with a post-compensation residual check and a bounded plausible source-age policy throughout client, service and drawing evidence.
- Keep mesh independent of Joints/Bones in Hands and managed apps; use an opaque, single-sided lit mesh by default, retaining the existing bone colour rather than skeleton opacity.
- Add fake-only lifecycle, transport, rendering and motion regressions, plus before/after still/normal/fast measurements with realistic processor latency and honest residual/visual limitations.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `hand-postprocessing`: extend contained ownership to Hands sessions; compensate motion with residual/age validation; make opaque mesh material independent of skeleton opacity.
- `hands-module`: render optional mesh in the live viewport, follow committed configuration and expose session-owned application/drawing evidence without starting capture from navigation or saves.

## Impact

Expected changes are in control-panel session preparation/lifecycle and post-processing backend routing, Hands session/view integration and the SDK module allowlist, and shared SDK mesh client/visual/application drawing paths. Update neutral protocol/plugin/Hands/SDK documentation and focused tests. Retain protocol-v2 capability names, native bootstrap, provider ABI and HANDS wire format. Existing old clients may keep their stricter freshness behavior and must not claim compensation support.

The post-processing controls module is owned by parallel work and will not be edited. Real plugins, runtime/model setup, physical cameras, browser/WebXR apps and offline packages are out of scope. Use only owned fake/disposable fixtures; do not operate the person's running services, profile, home runtime or other checkouts. Public artifacts contain no private plugin source or identifiers.
