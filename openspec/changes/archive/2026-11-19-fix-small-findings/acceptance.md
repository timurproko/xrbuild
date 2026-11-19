# Conditional implementation acceptance

Verdict: accepted only when an authorized human directly merges the containing exact pull-request head after required current-head validation, explicitly asks the active agent to execute that protected exact-head merge while it is currently eligible, or personally enables native auto-merge for the unchanged head and GitHub integrates it after validation succeeds.

The maintainer integration decision accepts these scenarios:
- `names add Display --exact` stores only the exact-case key, and lower-case `display` in text stays unflagged.
- `names add display` and `names add display --exact` still refuse, naming another word, a capitalised exact spelling or force.
- `names add display --force` still bans the lower-case word as before.
- The nightly triage test validates its scaffold through the shared workflow's pinned OpenSpec and fails clearly without that copy.
- `tools/pr-automation` has no OpenSpec dev dependency, and the lockfile no longer carries OpenSpec 1.11.0.
- The CI Node tests job checks out the shared workflow and points the tests at it with `XRB_WORKFLOW_HOME`.

```openspec-delivery
{
  "version": 3,
  "repository": "timurproko/xrbuild",
  "change": "fix-small-findings",
  "sourcePr": 40,
  "archive": "openspec/changes/archive/2026-11-19-fix-small-findings/",
  "acceptanceManifest": "openspec/changes/archive/2026-11-19-fix-small-findings/acceptance.md",
  "finalizedDate": "2026-11-19",
  "specBaseSha": "4c03fc82a10b4a4f1b197f3477bf18ee9b5ee2e0",
  "acceptanceScenarios": [
    "`names add Display --exact` stores only the exact-case key, and lower-case `display` in text stays unflagged.",
    "`names add display` and `names add display --exact` still refuse, naming another word, a capitalised exact spelling or force.",
    "`names add display --force` still bans the lower-case word as before.",
    "The nightly triage test validates its scaffold through the shared workflow's pinned OpenSpec and fails clearly without that copy.",
    "`tools/pr-automation` has no OpenSpec dev dependency, and the lockfile no longer carries OpenSpec 1.11.0.",
    "The CI Node tests job checks out the shared workflow and points the tests at it with `XRB_WORKFLOW_HOME`."
  ],
  "archiveDigest": "249f2050fab7e3429744a376fe85cf37c6d1271e76981b589184f71b328cce44",
  "specDigest": "1d6289b0e548570ac7a2d8a1ec017d00f9f2a0df472a6134250a923ae95ff0f9",
  "tasksDigest": "3e2160cc98568f6e5803f16daf065f3196685451100f77dcdfec2fb392cb9094",
  "evidenceDigest": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  "knownGaps": []
}
```
