# Conditional implementation acceptance

Verdict: accepted only when an authorized human directly merges the containing exact pull-request head after required current-head validation, explicitly asks the active agent to execute that protected exact-head merge while it is currently eligible, or personally enables native auto-merge for the unchanged head and GitHub integrates it after validation succeeds.

The maintainer integration decision accepts these scenarios:
- The required check, path-selected jobs and nightly run requirements name the `develop` branch.
- The agent session worktree context requirement names the `develop` branch for the primary checkout.

```openspec-delivery
{
  "version": 3,
  "repository": "timurproko/xrbuild",
  "change": "name-develop-in-specifications",
  "sourcePr": 28,
  "archive": "openspec/changes/archive/2026-11-18-name-develop-in-specifications/",
  "acceptanceManifest": "openspec/changes/archive/2026-11-18-name-develop-in-specifications/acceptance.md",
  "finalizedDate": "2026-11-18",
  "specBaseSha": "0a6e700afc3eb2bc11f85ceb0f0700c8cf2f02fb",
  "acceptanceScenarios": [
    "The required check, path-selected jobs and nightly run requirements name the `develop` branch.",
    "The agent session worktree context requirement names the `develop` branch for the primary checkout."
  ],
  "archiveDigest": "8a63eeed999655b863531d4ef1858074663e2720396da810ce4315aff6eeb111",
  "specDigest": "5db97fef899b52180d981b465cd28bd3ffd5e90bcb83a3d5edad0adb8c101ed5",
  "tasksDigest": "c9d54c93151b8b730894c1272fec55858f21d69d77278a030257abaa73729d40",
  "evidenceDigest": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  "knownGaps": []
}
```
