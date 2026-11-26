# Conditional implementation acceptance

Verdict: accepted only when an authorized human directly merges the containing exact pull-request head after required current-head validation, explicitly asks the active agent to execute that protected exact-head merge while it is currently eligible, or personally enables native auto-merge for the unchanged head and GitHub integrates it after validation succeeds.

The maintainer integration decision accepts these scenarios:
- Core and workspace freshly fetch each origin default branch and report their actual full before and after commits.
- Dirty, detached, local-ahead, diverged and unsuitable-upstream checkouts retain local work while the other repository is still attempted.
- Removed upstreams produce an actionable safe branch-switch instruction, and every partial failure fails the overall job.
- Changed public core dependency inputs use the pinned frozen hook-disabled install before fresh-process native rebuilds.
- Failed post-pull setup or rebuilds retain pending work and can be retried even when HEAD is unchanged.
- A changed core commit always leaves a final job-output line explicitly requiring panel Restart and stating no automatic restart occurred.

```openspec-delivery
{
  "version": 3,
  "repository": "timurproko/xrbuild",
  "change": "fix-update-default-branches",
  "sourcePr": 49,
  "archive": "openspec/changes/archive/2026-11-26-fix-update-default-branches/",
  "acceptanceManifest": "openspec/changes/archive/2026-11-26-fix-update-default-branches/acceptance.md",
  "finalizedDate": "2026-11-26",
  "specBaseSha": "48a59a5852237bcbaada593ad566b60f9f99c709",
  "acceptanceScenarios": [
    "Core and workspace freshly fetch each origin default branch and report their actual full before and after commits.",
    "Dirty, detached, local-ahead, diverged and unsuitable-upstream checkouts retain local work while the other repository is still attempted.",
    "Removed upstreams produce an actionable safe branch-switch instruction, and every partial failure fails the overall job.",
    "Changed public core dependency inputs use the pinned frozen hook-disabled install before fresh-process native rebuilds.",
    "Failed post-pull setup or rebuilds retain pending work and can be retried even when HEAD is unchanged.",
    "A changed core commit always leaves a final job-output line explicitly requiring panel Restart and stating no automatic restart occurred."
  ],
  "archiveDigest": "d6687ba62c0b4fb3067ce6f4774dfba90ba33779a689edb5da5df416d8f7e831",
  "specDigest": "12b5b563f93be8045c36115370ac944f719b558c646e81e857661e537788bade",
  "tasksDigest": "2b2f35c309cc1a43a91f5476df303ce35e90e5cf06fa677283cee701574d9b4a",
  "evidenceDigest": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  "knownGaps": []
}
```
