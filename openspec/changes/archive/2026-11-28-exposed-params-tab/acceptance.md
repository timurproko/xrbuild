# Conditional implementation acceptance

Verdict: accepted only when an authorized human directly merges the containing exact pull-request head after required current-head validation, explicitly asks the active agent to execute that protected exact-head merge while it is currently eligible, or personally enables native auto-merge for the unchanged head and GitHub integrates it after validation succeeds.

The maintainer integration decision accepts these scenarios:
- Launcher exposes one UI Kit Theme selector in Components directly after Develop; apps without exposed library consumption retain their existing tabs.
- Choices persist in the consuming project through normal settings writes, including bundled effective settings, without altering installed library defaults.
- Managed sessions update the existing Launcher scene and retain capture, paging and navigation state; existing bundled idle restrictions remain unchanged.
- Unmanaged builds retain the compiled saved choice, and no app-scene selector, new rendering owner, control redesign or theme redesign is introduced.

```openspec-delivery
{
  "version": 3,
  "repository": "timurproko/xrbuild",
  "change": "exposed-params-tab",
  "sourcePr": 70,
  "archive": "openspec/changes/archive/2026-11-28-exposed-params-tab/",
  "acceptanceManifest": "openspec/changes/archive/2026-11-28-exposed-params-tab/acceptance.md",
  "finalizedDate": "2026-11-28",
  "specBaseSha": "0a55b4cab06929809484ac2a71fcc6f8f5144bd0",
  "acceptanceScenarios": [
    "Launcher exposes one UI Kit Theme selector in Components directly after Develop; apps without exposed library consumption retain their existing tabs.",
    "Choices persist in the consuming project through normal settings writes, including bundled effective settings, without altering installed library defaults.",
    "Managed sessions update the existing Launcher scene and retain capture, paging and navigation state; existing bundled idle restrictions remain unchanged.",
    "Unmanaged builds retain the compiled saved choice, and no app-scene selector, new rendering owner, control redesign or theme redesign is introduced."
  ],
  "archiveDigest": "d8749048f9fd36bb2ed407eac6a77a6367f6bc2fd17748b393aa7321eca92675",
  "specDigest": "1058162e4085a861809262f17b1e0147afedf85bb87fbb9601e8a26c2bbd3a36",
  "tasksDigest": "e070c12ded2c51e8d2e00be483f764fa0373c3db48c06cba629b01c62ac7e257",
  "evidenceDigest": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  "knownGaps": []
}
```
