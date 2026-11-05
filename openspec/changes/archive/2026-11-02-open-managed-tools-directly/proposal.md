## Why

Following a managed-tool navigation entry currently replaces the application with a panel-owned **Starting…** card while package setup and Hand Tracking's native helper build run. Navigation should behave like navigation: the first document response should be the application, and native binaries should already be prepared and validated before user runtime.

## What Changes

- Add a bounded plugin-manifest API for enabled plugins to provision managed main-menu tools; disabling a plugin removes its entries, and existing workspace-level external/managed registrations remain supported.
- Register Hand Tracking Input through its plugin manifest instead of a manual workspace `xrb-tools.json` entry.
- Complete pinned workspace package setup before the panel starts listening and opens the browser.
- Hold a managed tool's first document request on its existing single-flight web-runtime initialization, then serve the application response directly instead of an intermediate startup page.
- Distribute Hand Tracking Input's native RGB-D helper as a pinned workspace runtime asset; opening the tool no longer compiles native code.
- Replace maintained `hand-lab`/`handlab` project, package, plugin, endpoint, service and output names with **Hand Tracking Input** / `hand-tracking`; keep only bounded legacy readers where existing recordings or persisted settings require compatibility.
- Add a Windows CI lane that builds and tests the helper source and verifies the distributed runtime manifest whenever the Hand Tracking bridge/runtime changes.
- Keep terminal managed-tool initialization failures bounded and retryable without changing camera, model, recording or native-service authorization.

## Scope

This changes managed-tool provisioning, readiness, presentation and the private Hand Tracking Input identity. It does not start camera capture, model workers, recording or the native camera service during panel launch or navigation, and it does not allow tool metadata to select setup/build commands.
