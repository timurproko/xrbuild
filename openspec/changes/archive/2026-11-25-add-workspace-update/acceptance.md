# Conditional implementation acceptance

Verdict: accepted only when an authorized human directly merges the containing exact pull-request head after required current-head validation, explicitly asks the active agent to execute that protected exact-head merge while it is currently eligible, or personally enables native auto-merge for the unchanged head and GitHub integrates it after validation succeeds.

The maintainer integration decision accepts these scenarios:
- A workspace behind its upstream is fast-forwarded, its LFS content pulled and its plugins rebuilt, with old and new commit and commit count reported.
- An up-to-date workspace reports Already up to date and nothing is rebuilt.
- Uncommitted edits that the new commits do not touch stay; edits they would overwrite stop the update with the file list and nothing changes.
- A diverged branch, an unreachable remote, a missing upstream, a folder that is not its own Git clone or missing Git LFS stop the update before anything changes.
- A failed LFS pull keeps the fast-forward, skips the rebuild and asks to run Update again.
- Update, Rebuild and runs refuse to overlap, and a running or starting host refuses the update.
- The panel shows workspace behind origin by N from the last fetch, says when the remote was last checked and never fetches on its own.
- Rebuild stays build-only, and the core checkout the panel runs from is never updated.

```openspec-delivery
{
  "version": 3,
  "repository": "timurproko/xrbuild",
  "change": "add-workspace-update",
  "sourcePr": 44,
  "archive": "openspec/changes/archive/2026-11-25-add-workspace-update/",
  "acceptanceManifest": "openspec/changes/archive/2026-11-25-add-workspace-update/acceptance.md",
  "finalizedDate": "2026-11-25",
  "specBaseSha": "db14ce1d55f31f9f762c96ce84301ef0d69b1b96",
  "acceptanceScenarios": [
    "A workspace behind its upstream is fast-forwarded, its LFS content pulled and its plugins rebuilt, with old and new commit and commit count reported.",
    "An up-to-date workspace reports Already up to date and nothing is rebuilt.",
    "Uncommitted edits that the new commits do not touch stay; edits they would overwrite stop the update with the file list and nothing changes.",
    "A diverged branch, an unreachable remote, a missing upstream, a folder that is not its own Git clone or missing Git LFS stop the update before anything changes.",
    "A failed LFS pull keeps the fast-forward, skips the rebuild and asks to run Update again.",
    "Update, Rebuild and runs refuse to overlap, and a running or starting host refuses the update.",
    "The panel shows workspace behind origin by N from the last fetch, says when the remote was last checked and never fetches on its own.",
    "Rebuild stays build-only, and the core checkout the panel runs from is never updated."
  ],
  "archiveDigest": "283e56722f4fdb317b27c29317e67aeac00ea4a461c82e68c1f506391ed16e33",
  "specDigest": "527a68e7e0824d8f2380a440edd73faf5d9a0bb920cbf9f104a1d118b2136230",
  "tasksDigest": "69eb11d749edaa1e80b273af28973ee013a797d1a08ccd988cd59f5bb31970ad",
  "evidenceDigest": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  "knownGaps": []
}
```
