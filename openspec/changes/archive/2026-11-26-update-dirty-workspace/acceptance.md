# Conditional implementation acceptance

Verdict: accepted only when an authorized human directly merges the containing exact pull-request head after required current-head validation, explicitly asks the active agent to execute that protected exact-head merge while it is currently eligible, or personally enables native auto-merge for the unchanged head and GitHub integrates it after validation succeeds.

The maintainer integration decision accepts these scenarios:
- Freshly current checkouts succeed with local work, and non-overlapping source edits survive fast-forward.
- Workspace settings, projects and generated locks remain local even when upstream changes them, with explicit inspection and adoption guidance.
- Genuine source collisions name blocking files without stashing, resetting, discarding work or changing branch history by force.
- Accepted core sources complete dependencies, bundled components and scoped native work when workspace source update is refused.
- Results use short revisions and one next-action line, reuse the existing Restart control, and record detailed output only once.
- Protected-path interruptions retain checked recovery state; outside index or ref changes and foreign locks are never discarded.

```openspec-delivery
{
  "version": 3,
  "repository": "timurproko/xrbuild",
  "change": "update-dirty-workspace",
  "sourcePr": 56,
  "archive": "openspec/changes/archive/2026-11-26-update-dirty-workspace/",
  "acceptanceManifest": "openspec/changes/archive/2026-11-26-update-dirty-workspace/acceptance.md",
  "finalizedDate": "2026-11-26",
  "specBaseSha": "e13221c8649942da2af6f93d5407cd611403c217",
  "acceptanceScenarios": [
    "Freshly current checkouts succeed with local work, and non-overlapping source edits survive fast-forward.",
    "Workspace settings, projects and generated locks remain local even when upstream changes them, with explicit inspection and adoption guidance.",
    "Genuine source collisions name blocking files without stashing, resetting, discarding work or changing branch history by force.",
    "Accepted core sources complete dependencies, bundled components and scoped native work when workspace source update is refused.",
    "Results use short revisions and one next-action line, reuse the existing Restart control, and record detailed output only once.",
    "Protected-path interruptions retain checked recovery state; outside index or ref changes and foreign locks are never discarded."
  ],
  "archiveDigest": "191fb2a3b0d5bcfffcec1a1338128e7957c449f4b15549f5ae6b16f7c335e13e",
  "specDigest": "bce0ca498e8852ce9f9bfc6b332b7e4f271df598ea46bbf0f8b9d1793945e5e9",
  "tasksDigest": "e5e5f85af708cc9df08c0ccb253b5dcec79c37a95935ea3a5d14d38852728e86",
  "evidenceDigest": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  "knownGaps": []
}
```
