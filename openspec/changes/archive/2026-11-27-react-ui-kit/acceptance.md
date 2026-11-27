# Conditional implementation acceptance

Verdict: accepted only when an authorized human directly merges the containing exact pull-request head after required current-head validation, explicitly asks the active agent to execute that protected exact-head merge while it is currently eligible, or personally enables native auto-merge for the unchanged head and GitHub integrates it after validation succeeds.

The maintainer integration decision accepts these scenarios:
- UI Kit controls share SDK targets and frames, preserve baseline behavior and release owned resources.
- UI Kit and Launcher expose public component entries without starting their run entries on import.
- Launcher bundles the UI Kit app's exported controls inside its own SDK-owned runtime.
- New projects export AppScene while retaining the authored text, animation, icon assets and notices.
- Existing imperative consumers remain supported without importing the React component runtime.
- Application rendering defaults and Mouse-off hand input policies remain unchanged.
- Themes, app settings and control-panel UI remain outside this change.

```openspec-delivery
{
  "version": 3,
  "repository": "timurproko/xrbuild",
  "change": "react-ui-kit",
  "sourcePr": 68,
  "archive": "openspec/changes/archive/2026-11-27-react-ui-kit/",
  "acceptanceManifest": "openspec/changes/archive/2026-11-27-react-ui-kit/acceptance.md",
  "finalizedDate": "2026-11-27",
  "specBaseSha": "0704c7956cc5222d993f2494318f866c2e74f40d",
  "acceptanceScenarios": [
    "UI Kit controls share SDK targets and frames, preserve baseline behavior and release owned resources.",
    "UI Kit and Launcher expose public component entries without starting their run entries on import.",
    "Launcher bundles the UI Kit app's exported controls inside its own SDK-owned runtime.",
    "New projects export AppScene while retaining the authored text, animation, icon assets and notices.",
    "Existing imperative consumers remain supported without importing the React component runtime.",
    "Application rendering defaults and Mouse-off hand input policies remain unchanged.",
    "Themes, app settings and control-panel UI remain outside this change."
  ],
  "archiveDigest": "d0dd10a0ce1dabb257e133a80ad30ba012b8455191aaf786d63d21b2b6266c79",
  "specDigest": "1ceff3eec06e5c2af6857263b711d5c88a886c920a04be9814c6f1d3c30643df",
  "tasksDigest": "c40aca1637737ae7fc2485009fdddb1b77a71ed76e54dc15e7db9268e0a4e849",
  "evidenceDigest": "23cfc9492be3a9797650dff803665ca188615ec3bfc46e9f74d52a13975d7062",
  "knownGaps": []
}
```
