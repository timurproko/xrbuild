# Conditional implementation acceptance

Verdict: accepted only when an authorized human directly merges the containing exact pull-request head after required current-head validation, explicitly asks the active agent to execute that protected exact-head merge while it is currently eligible, or personally enables native auto-merge for the unchanged head and GitHub integrates it after validation succeeds.

The maintainer integration decision accepts these scenarios:
- Update fast-forwards the workspace to the commit it fetched; a remote that moves during the LFS download is picked up by the next Update, not this one.
- A workspace that is the core checkout is refused by the workspace part with that reason, so the one repository is never updated twice.
- The panel menu item is named exactly Update and no panel text says Update workspace.
- The Update tooltip names the core's and the workspace's state and when the remote was last checked.
- A core that is behind or cannot be updated is reported in the tooltip and the result as not updated by this version, to be pulled by hand.
- `GET /api/update` returns the core and workspace status and whether an update runs; `POST /api/update` starts job kind `update`.
- Remote URL credentials are redacted from the update's job output.

```openspec-delivery
{
  "version": 3,
  "repository": "timurproko/xrbuild",
  "change": "reshape-update-action",
  "sourcePr": 45,
  "archive": "openspec/changes/archive/2026-11-26-reshape-update-action/",
  "acceptanceManifest": "openspec/changes/archive/2026-11-26-reshape-update-action/acceptance.md",
  "finalizedDate": "2026-11-26",
  "specBaseSha": "69989833096a3c8fed6086da186dff431eb44b20",
  "acceptanceScenarios": [
    "Update fast-forwards the workspace to the commit it fetched; a remote that moves during the LFS download is picked up by the next Update, not this one.",
    "A workspace that is the core checkout is refused by the workspace part with that reason, so the one repository is never updated twice.",
    "The panel menu item is named exactly Update and no panel text says Update workspace.",
    "The Update tooltip names the core's and the workspace's state and when the remote was last checked.",
    "A core that is behind or cannot be updated is reported in the tooltip and the result as not updated by this version, to be pulled by hand.",
    "`GET /api/update` returns the core and workspace status and whether an update runs; `POST /api/update` starts job kind `update`.",
    "Remote URL credentials are redacted from the update's job output."
  ],
  "archiveDigest": "bfa7fe72cff47d488669db1adb2d1dfc923c626d7c1a08ad797ff628f6e4d4db",
  "specDigest": "85f14aa3d4948b9d1ef07c2f0bffd7187dd1ce0a24de61a52c986c2319d63e6b",
  "tasksDigest": "b0115ee1023fd1104d1bc375a4b1844d17a7c86c5a420915efcf1b9211169dbe",
  "evidenceDigest": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  "knownGaps": []
}
```
