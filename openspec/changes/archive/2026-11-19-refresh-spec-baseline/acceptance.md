# Conditional implementation acceptance

Verdict: accepted only when an authorized human directly merges the containing exact pull-request head after required current-head validation, explicitly asks the active agent to execute that protected exact-head merge while it is currently eligible, or personally enables native auto-merge for the unchanged head and GitHub integrates it after validation succeeds.

The maintainer integration decision accepts these scenarios:
- Strict OpenSpec validation passes for this change and for every specification.
- Archiving the change applies every delta and deletes the two retired specifications.
- No code, tests or documentation outside `openspec/changes/` changed.

```openspec-delivery
{
  "version": 3,
  "repository": "timurproko/xrbuild",
  "change": "refresh-spec-baseline",
  "sourcePr": 34,
  "archive": "openspec/changes/archive/2026-11-19-refresh-spec-baseline/",
  "acceptanceManifest": "openspec/changes/archive/2026-11-19-refresh-spec-baseline/acceptance.md",
  "finalizedDate": "2026-11-19",
  "specBaseSha": "8aebd65ecaacc6d753c73d8f47b5575cb59d1bad",
  "acceptanceScenarios": [
    "Strict OpenSpec validation passes for this change and for every specification.",
    "Archiving the change applies every delta and deletes the two retired specifications.",
    "No code, tests or documentation outside `openspec/changes/` changed."
  ],
  "archiveDigest": "2b3c089797c56e3ba98614f7a46813b7d1d54f66bf0ecc3a49c2ca4a04e8196c",
  "specDigest": "9b3273380a764758346b1ea6bcb4cfe8a30832d6319af1398af0b5ff8acc88e9",
  "tasksDigest": "1878306f51aa9d7b8f568ae522969bbcda257e9a1b0ec0929c4364db0f2dc38c",
  "evidenceDigest": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  "knownGaps": []
}
```
