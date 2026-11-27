# Proposal

## Why

The optional hand-mesh service drops acquisition confidence before final-pose dispatch, cannot acknowledge live settings, times out realistic cold preparation, and relies on cooperative child exit. A neutral, backward-compatible foundation is needed before separately installed processors and later Hands controls/viewport integration can depend on it.

## What Changes

- Preserve per-joint confidence, observation support and observation age alongside the final adjusted/filtered/predicted pose without changing provider ABI, raw wire layouts or interaction.
- Negotiate versioned mesh capabilities; add bounded live configure/applied acknowledgements and settings-generation fences across service and SDK. Declare live versus reprepare settings and expose saved, applying, applied and drawing generations separately.
- Replace the fixed modern ready deadline with a plugin-declared, core-bounded preparation allowance and Preparing/Ready/Failed status with bounded progress/reason. Repreparation keeps the owning app/input session alive.
- Contain the owned mesh process tree from birth, with bounded graceful Stop, forced fallback and verified teardown on cancellation, crash, owner loss and panel exit.
- Resolve optional plugin-owned runtime generations in the selected writable workspace using checked receipts and contained files, without executing discovery, knowing model/runtime contents, or installing anything.
- Keep mesh selection independent from Joints/Bones appearance. Provide run-owned control hooks and apply saved post-processing changes to existing compatible managed desktop consumers; later Hands live-session/viewport wiring reuses those hooks.
- Retain legacy declarations/processors/consumers through explicit capability negotiation and honest unsupported/relaunch status, never by inventing acknowledgements or observation support.

## Capabilities

### New Capabilities

None; extend the existing hand-processing boundaries.

### Modified Capabilities

- `hand-postprocessing`: negotiated observations/configuration, preparation, safe process ownership, checked writable runtimes and independent mesh visibility.
- `hand-input`: optional observation metadata survives to final sampling without changing acquisition, geometry or interaction semantics.
- `hands-module`: backend saved-versus-applied post-processing status and revised current-run semantics, without implementing the later controls redesign or viewport integration.

## Impact

Core panel mesh declaration/discovery/state/run APIs and existing managed desktop ownership, SDK Hand sampling/mesh codec/client/standard visual, a CEF-free mesh process supervisor/build artifact, focused fake-processor fixtures/tests, and neutral mesh documentation. Existing provider ABI and portable profiles/packages remain unchanged. No real processor, runtime/model installer, private source/assets, camera use, public-browser/WebXR execution, offline mesh packaging, Hands settings controls redesign, or Hands live-session/viewport wiring is included. All execution evidence in this stage is isolated fake-processor software testing, not physical tracking or visual-quality acceptance.
