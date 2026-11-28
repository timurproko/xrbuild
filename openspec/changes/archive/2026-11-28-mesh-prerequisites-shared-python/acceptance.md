# Conditional implementation acceptance

Verdict: accepted only when an authorized human directly merges the containing exact pull-request head after required current-head validation, explicitly asks the active agent to execute that protected exact-head merge while it is currently eligible, or personally enables native auto-merge for the unchanged head and GitHub integrates it after validation succeeds.

The maintainer integration decision accepts these scenarios:
- Rebuild succeeds with a hand-mesh plugin that builds its own engine program in the selected workspace.
- A hand-mesh layer whose runtime is missing or stale shows Prerequisite and Install, and Install recovers it without manual commands.
- A plugin that declares Python gets an exact interpreter and hash-locked wheels from core, listed in the same Install consent.
- Layer and plugin switches never show the opposite state while a change is being saved.
- Hand meshes from processors that skip repeated samples stay steady in the Hands viewport.
- UI Kit and Launcher offer Default and Accent in a last Settings tab, and a saved Chamfer choice opens as Accent.
- Changing Settings while an app runs updates it in place without saving, and Stop restores the saved values.
- Settings save failures and Hands start blockers appear as toasts with one action instead of inline status text.

```openspec-delivery
{
  "version": 3,
  "repository": "timurproko/xrbuild",
  "change": "mesh-prerequisites-shared-python",
  "sourcePr": 71,
  "archive": "openspec/changes/archive/2026-11-28-mesh-prerequisites-shared-python/",
  "acceptanceManifest": "openspec/changes/archive/2026-11-28-mesh-prerequisites-shared-python/acceptance.md",
  "finalizedDate": "2026-11-28",
  "specBaseSha": "1deed69b64e167d4ab88ba5b3d4d0be6cf29818d",
  "acceptanceScenarios": [
    "Rebuild succeeds with a hand-mesh plugin that builds its own engine program in the selected workspace.",
    "A hand-mesh layer whose runtime is missing or stale shows Prerequisite and Install, and Install recovers it without manual commands.",
    "A plugin that declares Python gets an exact interpreter and hash-locked wheels from core, listed in the same Install consent.",
    "Layer and plugin switches never show the opposite state while a change is being saved.",
    "Hand meshes from processors that skip repeated samples stay steady in the Hands viewport.",
    "UI Kit and Launcher offer Default and Accent in a last Settings tab, and a saved Chamfer choice opens as Accent.",
    "Changing Settings while an app runs updates it in place without saving, and Stop restores the saved values.",
    "Settings save failures and Hands start blockers appear as toasts with one action instead of inline status text."
  ],
  "archiveDigest": "4d577dfb71538a7fdf93e054434b181bc41d9ea61811032f6107241cfce9db3d",
  "specDigest": "a803d7379a311898b9d43af7b8ab5ee9ff554a40e7308a60294a1bb2456d2272",
  "tasksDigest": "53163ff51602eee577479bc3a0fef2dc6a1d62dea81a19fbbe486ea81026bdb4",
  "evidenceDigest": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  "knownGaps": []
}
```
