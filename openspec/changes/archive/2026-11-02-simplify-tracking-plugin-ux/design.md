## Context

Workspace discovery currently starts from every directory under `plugins/`. A renamed plugin can therefore leave an ignored `bin/` or `build/` directory that still appears in Plugins Manager and can still contribute a provider directory even though its tracked manifest and source moved. Plugin cards also derive versions from native provider metadata or packager packages rather than one required plugin identity. The Hand Tracking managed tool lazily creates its web runtime on first navigation, and the resulting helper activity can surface as a terminal window.

## Decisions

1. Make `xrb-plugin.json` the required top-level plugin boundary. A catalog candidate must have that file; a present but invalid manifest remains visible as a problem, while a directory containing only ignored generated artifacts is not a plugin and is not passed to the host.
2. Require `version` beside `title` and `type`, validate it as a bounded `major.minor.patch` semantic version, return it through `PluginMeta`, and display it as the plugin card version. Native provider ABI metadata remains available for host/provider diagnostics but no longer overrides the product version shown by Plugins Manager.
3. Add version `0.1.0` to every maintained private workspace plugin manifest. Keep each folder and internal provider ID stable unless a compatibility-safe rename is independently required.
4. Use one visible identity, **Hand Tracking**, for the maintained plugin, menu entry, browser/application chrome and current diagnostic copy. Keep source/package/storage/protocol identifiers stable where changing them would create migration risk.
5. Give the independent calibrated-rig integration its intended private workspace label. An enabled manifest-backed input provider remains available in the Input selector under that manifest title, including this integration's stable internal provider ID. It remains its own provider and dependency boundary; consolidation means removing duplicate/stale presentation of the maintained implementation, not combining unrelated runtimes.
6. Prevent first menu navigation from launching a shell, installer, compiler, visible console or child service. Package readiness remains before panel listen. The managed application runtime must be initialized in a console-free/process-bounded form, and native camera-service creation remains behind explicit capture or calibration actions.
7. Let bounded `panel.targets` manifest metadata provision supported standalone platform tabs. The standalone browser target belongs to its enabled workspace plugin instead of an unconditional UI constant. Disabling that plugin removes the tab on the generic `plugins-changed` refresh; a project already saved to that target remains visible as unavailable and is never silently rewritten.
8. Cover manifest filtering/version validation, plugin-owned platform tabs and managed-navigation process behavior with generic Control Panel tests, plus private workspace assertions for the two intended hand-related plugin labels and one Hand Tracking menu item.

## Risks and Bounds

- Ignoring manifest-less plugin folders changes legacy behavior. This is intentional: the manifest becomes the required plugin contract, and malformed tracked manifests remain diagnosable instead of disappearing.
- Runtime/provider versions may differ from the product manifest version. Keep both values internally where useful, but present only the required manifest version on the plugin card.
- Existing project/provider selections use stable internal IDs. Do not rewrite them merely to change display labels.
- Removing lazy helper processes must not move camera, model, recording or native-service startup into panel launch. Verify idle opening separately from explicit capture.
- Generated legacy folders may remain on disk because they are user/build output. Excluding them from discovery avoids destructive cleanup and prevents them from resurfacing as plugins.
- Removing a plugin-owned tab can leave a saved project targeting an unavailable integration. Preserve and label that state instead of falling back or modifying the manifest.
