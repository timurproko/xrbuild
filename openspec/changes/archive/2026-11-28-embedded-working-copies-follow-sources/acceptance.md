# Conditional implementation acceptance

Verdict: accepted only when an authorized human directly merges the containing exact pull-request head after required current-head validation, explicitly asks the active agent to execute that protected exact-head merge while it is currently eligible, or personally enables native auto-merge for the unchanged head and GitHub integrates it after validation succeeds.

The maintainer integration decision accepts these scenarios:
- After a restart, Launcher and UI Kit list the manifest fields merged in core, such as componentLibraries, without a Run.
- Discovery never writes, and an embedded project without a working copy is never materialized by the refresh.
- A conflicting personal edit fails the refresh job, leaves state and files unchanged and is shown on the project.
- A running project is not refreshed under its run and is refreshed after the run ends.

```openspec-delivery
{
  "version": 3,
  "repository": "timurproko/xrbuild",
  "change": "embedded-working-copies-follow-sources",
  "sourcePr": 73,
  "archive": "openspec/changes/archive/2026-11-28-embedded-working-copies-follow-sources/",
  "acceptanceManifest": "openspec/changes/archive/2026-11-28-embedded-working-copies-follow-sources/acceptance.md",
  "finalizedDate": "2026-11-28",
  "specBaseSha": "f655827e7c280663f10dcd843125562bce3f44ca",
  "acceptanceScenarios": [
    "After a restart, Launcher and UI Kit list the manifest fields merged in core, such as componentLibraries, without a Run.",
    "Discovery never writes, and an embedded project without a working copy is never materialized by the refresh.",
    "A conflicting personal edit fails the refresh job, leaves state and files unchanged and is shown on the project.",
    "A running project is not refreshed under its run and is refreshed after the run ends."
  ],
  "archiveDigest": "f362503ca4df998f59f644c6b699f6465a1ecb85fc33799beba9786271af9421",
  "specDigest": "df2d6fd7c0f1de4ec4f5fdf5eafc3478c6ee8856bb84cf2e1d96002fd5f741a1",
  "tasksDigest": "8a6c76079c0c9c0910665f30c1635dd1c49049e21dcced52b5d8b6fb45e3dc2b",
  "evidenceDigest": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  "knownGaps": []
}
```
