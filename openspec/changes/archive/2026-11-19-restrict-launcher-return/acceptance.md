# Conditional implementation acceptance

Verdict: accepted only when an authorized human directly merges the containing exact pull-request head after required current-head validation, explicitly asks the active agent to execute that protected exact-head merge while it is currently eligible, or personally enables native auto-merge for the unchanged head and GitHub integrates it after validation succeeds.

The maintainer integration decision accepts these scenarios:
- A launch link whose return address is on a foreign origin gives the app no return control.
- Escape in an app launched with a foreign return address does not navigate anywhere.
- Same-origin, loopback development and native host launchers keep their return control and Escape return.

```openspec-delivery
{
  "version": 3,
  "repository": "timurproko/xrbuild",
  "change": "restrict-launcher-return",
  "sourcePr": 39,
  "archive": "openspec/changes/archive/2026-11-19-restrict-launcher-return/",
  "acceptanceManifest": "openspec/changes/archive/2026-11-19-restrict-launcher-return/acceptance.md",
  "finalizedDate": "2026-11-19",
  "specBaseSha": "08e82ef5b27d421ecd30697b7b2136e37e9a6376",
  "acceptanceScenarios": [
    "A launch link whose return address is on a foreign origin gives the app no return control.",
    "Escape in an app launched with a foreign return address does not navigate anywhere.",
    "Same-origin, loopback development and native host launchers keep their return control and Escape return."
  ],
  "archiveDigest": "e015b12ce2961e5225dc005868b34e3960b9b7305803a7d806919f4eab669ed7",
  "specDigest": "913794658c4346053397cf886a2cc07bad31d798bf145fec3f3d36162954d2c2",
  "tasksDigest": "38d46fc06e338f435ad5dd468b13f2b47670f4b8ad0dbd4e59a9ec9abd0ee2de",
  "evidenceDigest": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  "knownGaps": []
}
```
