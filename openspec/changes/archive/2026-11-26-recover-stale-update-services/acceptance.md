# Conditional implementation acceptance

Verdict: accepted only when an authorized human directly merges the containing exact pull-request head after required current-head validation, explicitly asks the active agent to execute that protected exact-head merge while it is currently eligible, or personally enables native auto-merge for the unchanged head and GitHub integrates it after validation succeeds.

The maintainer integration decision accepts these scenarios:
- Rebuild prepares changed application components, and Run, preview and Build use the same logged preparation before continuing.
- New immutable component generations reload while idle without restart; unavoidable loaded-code changes offer Restart in the job result.
- Failed preparation retains output and Retry, while unsafe records, modified output and active or leftover locks remain preserved.
- Update prepares components using fresh post-pull code, retries unfinished preparation and names pending components in its final line.
- Update host and plugin builds use the desktop-validated CMake and generator instead of an incompatible first PATH executable.

```openspec-delivery
{
  "version": 3,
  "repository": "timurproko/xrbuild",
  "change": "recover-stale-update-services",
  "sourcePr": 54,
  "archive": "openspec/changes/archive/2026-11-26-recover-stale-update-services/",
  "acceptanceManifest": "openspec/changes/archive/2026-11-26-recover-stale-update-services/acceptance.md",
  "finalizedDate": "2026-11-26",
  "specBaseSha": "0f6fe0dfaaf3401a8eec21eaf5b0ab10a8e91b9e",
  "acceptanceScenarios": [
    "Rebuild prepares changed application components, and Run, preview and Build use the same logged preparation before continuing.",
    "New immutable component generations reload while idle without restart; unavoidable loaded-code changes offer Restart in the job result.",
    "Failed preparation retains output and Retry, while unsafe records, modified output and active or leftover locks remain preserved.",
    "Update prepares components using fresh post-pull code, retries unfinished preparation and names pending components in its final line.",
    "Update host and plugin builds use the desktop-validated CMake and generator instead of an incompatible first PATH executable."
  ],
  "archiveDigest": "c040663891d401c46013be72d011c0dcff32c8955bbedded3581573dc2f876aa",
  "specDigest": "18004d0be50aded37e59f1458ad3dd3e99d4a536a782c5ebcdc816f2fdcc6250",
  "tasksDigest": "d098005d51a92c55c99218db0149b5ce562e68c4bbe8aab2332e43dd5a0d3bd7",
  "evidenceDigest": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  "knownGaps": []
}
```
