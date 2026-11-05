## Context

Managed tools are lazy and single-flight, but the panel currently answers the first root request with a separate startup document. Hand Tracking also awaits `prepareNativeAsync()` before creating its Vite middleware, so a missing or stale local helper turns navigation into a visible CMake/MSBuild preparation phase. The native helper build output is ignored and therefore is not delivered by a normal pull.

## Decisions

1. Extend bounded `xrb-plugin.json` metadata with a declarative panel-tools list. The panel reads tools only from enabled plugins, prefixes each relative module with that plugin's folder, applies the same ID/route/endpoint/overlap limits as workspace tools, and accepts no commands, arguments or credentials. Merge plugin-provisioned entries with the existing optional workspace tool file so external loopback integrations remain compatible.
2. Move Hand Tracking Input's main-menu registration into `input-hand-tracking/xrb-plugin.json`; its plugin-owned wrapper module may delegate to the contained diagnostic web package. Remove its manual workspace tool entry. Disabling the plugin removes the menu entry and starts nothing.
3. Run the existing fixed `corepack pnpm install --frozen-lockfile` readiness check during panel launch, before the server listens or opens the browser. Keep the managed-tool startup check as an idempotent guard; metadata still cannot provide a command or arguments.
4. For a managed root `GET`/`HEAD`, start or join the existing runtime promise and await it inside that request. On success, dispatch the same request to the tool instance so the browser receives the application's document directly. Preserve the themed error/retry document only for a terminal startup failure.
5. Remove native compilation from Hand Tracking's workspace-tool factory. The factory creates the local web runtime only; opening it still creates no camera stream, model worker, recording or native camera service.
6. Rename the maintained private integration from the old laboratory codename to **Hand Tracking Input**: project/package `hand-tracking-input`, plugin `input-hand-tracking`, provider/service/runtime identifiers `hand-tracking`, and same-origin internal endpoints under `/__handtracking/`. New exports, filenames, storage keys, messages and documentation use the canonical name. Legacy recording formats and persisted keys are accepted only through explicit migration/reader constants so existing operator data is not silently lost.
7. Store the native helper and required runtime files in a dedicated LFS-backed runtime folder with a bounded manifest of source-input hashes. The explicit same-origin bridge bootstrap uses that prepared runtime and never invokes CMake/MSBuild.
8. Add a Windows CI job selected by Hand Tracking bridge/runtime and CI-workflow paths. It hydrates only required dependencies, builds and tests the helper source, validates the runtime manifest against source inputs, and runs the distributed helper's self-tests.
9. Keep direct development build commands available for producing an updated runtime, but they are maintainer/development actions rather than navigation behavior.

## Risks and Bounds

- Plugin metadata can create route or identity collisions. Validate the combined enabled-plugin and workspace-tool inventory before importing any module; one invalid inventory reports an error and starts nothing.
- Awaiting a broken module could hold a browser request indefinitely. Existing shutdown cancellation remains; tests use bounded fixture startup, and terminal rejection returns the retry page.
- The identity rename can break old recordings or settings. Preserve bounded legacy readers/migration, test them directly, and never present the retired name in current UI or generated output.
- A tracked binary can drift from source. The source-hash manifest and selected Windows CI build make bridge-source changes fail unless the distributed runtime is updated and both built and distributed helpers pass self-tests.
- LFS hydration must stay bounded. CI pulls only the bridge runtime and pinned depth-camera SDK files needed by the helper rather than the complete private workspace dependency set.
- Package installation can still take time after a pull, but it happens before the panel advertises itself or opens a browser, never as a managed-tool navigation page.
