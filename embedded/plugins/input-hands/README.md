# Hands

Plugin/catalog ID: **`input-hands`** (display name **Hands**). The tool route `/hand-tracking/`, native provider ID,
recording format and persistent recording/cache paths remain stable; only plugin ownership/configuration uses the new ID.

Bundled hand-tracking implementation, plugin-owned diagnostic/sample, tests and build descriptors. The native provider ID remains `hand-tracking`; its application input is **synthetic**, not neural/camera input. It uses the public C ABI, deterministic authored 21-joint fixtures and the core's pinned header-only JSON dependency. There is no dependency on another input plugin.

## Ownership

- Implementation/defaults: `embedded/plugins/input-hands/`, read-only during normal use.
- Public native/vision dependency assets: core `third_party/hand-tracking/`, only through explicit verified setup/build steps. Package dependencies use the separate frozen embedded installation.
- Configuration/calibration/preferences: selected workspace `config/plugins/input-hands/`.
- Recordings: selected workspace `.xrb/hand-tracking/recordings/`.
- Generated native/tool/typecheck/build output: selected workspace `build/hand-tracking/` or the core's origin/source-scoped native build cache.

Ordinary user workspace means `XRB_HOME`, otherwise the home `.xrbuild`; core location is supplied by `XRB_CORE`. No source-folder walk guesses user ownership. Existing user files/history are not imported, moved, overwritten or deleted by discovery/setup.

## Use and validation

After explicit bundled setup, Plugins → **Hands · Bundled** opens the diagnostic on the normal panel's `/hand-tracking/` route. Default use is a generated fixture: opening the page does not request cameras, start inference, fetch model weights or compile device code. Application selection hides the synthetic provider from normal real-input choices; explicit test manifests can select it.

The plugin owns `samples/hand-tracking`; Import creates an independently editable workspace copy. The frozen embedded package graph builds/tests/types this nested sample without a private clone. Run the core embedded validation entry point with an explicit writable workspace.

The focused `build.mjs` uses the core selected-origin native plan, lock/receipts and CTest; embedded native output is user-owned, not `bin/` or `build/` under this source folder. Synthetic settings: scenario `stationary|motion|teleport|dropout|invalid`, hands 1–2, requested cadence 1–120 Hz (default motion/2/60). Stop/restart applies changes. Invalid fixtures are diagnostics, not valid application input. Stop joins the producer; native gestures remain zero.

## Optional functionality and limits

Browser RGB inference, native depth acquisition, calibration, reconstruction, recording/replay and fusion source are included in the diagnostic. They require explicit actions and independently available dependencies; they are not implicitly activated by being embedded. Neural diagnostic poses are not delivered as native application input.

Reviewed runtime/marker licenses and pins are documented with the sample. No pretrained model weights, camera recordings, private prebuilt bridge executable or device library are shipped. Unknown model/device redistribution rights are not granted by source approval; optional payload/distribution and physical-device acceptance remain separate gates. See [diagnostic](samples/hand-tracking/README.md) and [bridge](samples/hand-tracking/bridge/README.md).
