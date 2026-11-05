# Proposal

## Why

Every app currently creates and owns a perspective camera. That makes projection a per-app implementation detail,
so a workspace cannot consistently present the same apps orthographically on a desktop/browser channel and with
perspective on a 3D or immersive channel. New apps also repeat renderer, camera, resize and frame-loop setup instead
of receiving those runtime concerns from one system template.

## What Changes

- Add a global **Settings** page to the panel menu. Its Camera section lists the same distribution choices as the
  project Platform control (Desktop, WebXR and installed platform choices) and stores one projection policy per
  choice. The first policy is Perspective or Orthographic; every newly discovered choice defaults to Perspective.
- Make Settings the single panel surface for workspace configuration contributed by installed plugins. A bounded
  declarative plugin schema exposes runtime-provider settings and plugin-owned tool/app preferences without loading
  arbitrary plugin UI into the panel. Plugin Manager remains responsible for installation state, metadata and samples.
- Give plugin-owned tools a same-origin API for reading their saved global preferences. Move the hand-tracking
  provider configuration and diagnostic-app controls out of Plugin Manager and the diagnostic tool's own Settings tab
  into its plugin card on the global Settings page.
- Persist camera policies once per workspace, independently of project manifests. Disabled or temporarily missing
  platform choices keep their saved policy, while an unconfigured or newly installed choice uses the Perspective
  default.
- Pass the selected project's effective distribution choice and resolved camera policy into dev and production app
  builds. A camera-policy change makes prior output stale so the next Run, package or publication rebuilds it with
  the new policy.
- Add an SDK app template/runtime that owns renderer integration, camera creation, resize and frame rendering. Apps
  inject their scene and UI content and may configure app-specific pose/framing, but do not choose the projection
  type themselves.
- Support an orthographic app camera in mono browser and 2D host views. Stereo displays and immersive sessions keep
  physically correct perspective eye cameras, while the same app content and interaction mapping continue to work.
- Update the starter template and tracked workspace apps to use the shared runtime, or its managed-camera helper for
  specialized render pipelines, so the global setting applies without camera edits in every app.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dev-control-panel`: add workspace-global Settings, per-distribution camera policies and camera-aware build context.
- `web-runtime-sdk`: add the shared app runtime and orthographic mono rendering while retaining perspective stereo and
  immersive rendering.

## Impact

- `packages/control-panel`: navigation, Settings UI/API, workspace settings persistence, platform-choice reuse,
  bounded plugin setting contributions, plugin preference APIs, build environment and build-receipt invalidation;
  focused panel tests.
- `packages/sdk`: managed camera/app runtime, generalized camera rendering and tests for mono, stereo and immersive
  behavior.
- `templates/app`: apps provide content and framing to the runtime instead of constructing their own camera and loop.
- `.xrbuild/projects`: tracked apps adopt the managed runtime/camera contract so the global policy is effective across
  the current workspace.
- `.xrbuild/plugins`: the hand-tracking integration declares runtime and tool preference schemas globally, and its
  diagnostic tool consumes those preferences instead of owning a separate Settings tab.
- Workspace data: a new bounded global settings file stores camera policies by stable platform-choice key; project
  manifests and package formats remain compatible.
