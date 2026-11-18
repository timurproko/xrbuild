# Conditional implementation acceptance

Verdict: accepted only when an authorized human directly merges the containing exact pull-request head after required current-head validation, explicitly asks the active agent to execute that protected exact-head merge while it is currently eligible, or personally enables native auto-merge for the unchanged head and GitHub integrates it after validation succeeds.

The maintainer integration decision accepts these scenarios:
- The change-delivery specification keeps only the four repository-specific requirements and one delegation requirement.
- The repository-governance specification no longer exists after finalization.
- The ci-validation specification no longer names a local delivery check, base-commit policy or branch refresh.

```openspec-delivery
{
  "version": 3,
  "repository": "timurproko/xrbuild",
  "change": "retire-local-delivery-specs",
  "sourcePr": 24,
  "archive": "openspec/changes/archive/2026-11-18-retire-local-delivery-specs/",
  "acceptanceManifest": "openspec/changes/archive/2026-11-18-retire-local-delivery-specs/acceptance.md",
  "finalizedDate": "2026-11-18",
  "specBaseSha": "c4071fb20a9b44fa6114538f7b8da9752873dc6d",
  "acceptanceScenarios": [
    "The change-delivery specification keeps only the four repository-specific requirements and one delegation requirement.",
    "The repository-governance specification no longer exists after finalization.",
    "The ci-validation specification no longer names a local delivery check, base-commit policy or branch refresh."
  ],
  "archiveDigest": "c236997050988f7e501001671cd3db8ecdc9efe38249af42644078f5ccf07c9c",
  "specDigest": "eb183b0ff48509a3d1ae2ad97da80014326a844941c1f423938ee8459ab57a63",
  "tasksDigest": "bd801357529cb43170c8374d0f726b9223abe80c2dc035423db9262c47726534",
  "evidenceDigest": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  "knownGaps": []
}
```
