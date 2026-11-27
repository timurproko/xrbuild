# Conditional implementation acceptance

Verdict: accepted only when an authorized human directly merges the containing exact pull-request head after required current-head validation, explicitly asks the active agent to execute that protected exact-head merge while it is currently eligible, or personally enables native auto-merge for the unchanged head and GitHub integrates it after validation succeeds.

The maintainer integration decision accepts these scenarios:
- Header maintenance labels are short, and Restart is refused while Rebuild, Update or a post-processing install runs.
- The Hands page opens with the viewer, Start and the side panel tabs already in place after reloads and restarts.
- A hand mesh plugin added as a layer can be installed, cancelled, switched off and recoloured from its card without a terminal.
- The SOMA hand mesh draws in the Hands viewer without flicker once its runtime is installed and the session runs.
- Plugin setup progress, mesh states and errors appear in the Log tab or as toasts named after the plugin.

```openspec-delivery
{
  "version": 3,
  "repository": "timurproko/xrbuild",
  "change": "hands-workspace-polish",
  "sourcePr": 66,
  "archive": "openspec/changes/archive/2026-11-27-hands-workspace-polish/",
  "acceptanceManifest": "openspec/changes/archive/2026-11-27-hands-workspace-polish/acceptance.md",
  "finalizedDate": "2026-11-27",
  "specBaseSha": "206d8dfdc48e0023521c0fce4a62b8b47821b773",
  "acceptanceScenarios": [
    "Header maintenance labels are short, and Restart is refused while Rebuild, Update or a post-processing install runs.",
    "The Hands page opens with the viewer, Start and the side panel tabs already in place after reloads and restarts.",
    "A hand mesh plugin added as a layer can be installed, cancelled, switched off and recoloured from its card without a terminal.",
    "The SOMA hand mesh draws in the Hands viewer without flicker once its runtime is installed and the session runs.",
    "Plugin setup progress, mesh states and errors appear in the Log tab or as toasts named after the plugin."
  ],
  "archiveDigest": "1a0dda52daed71618b0b3c199043513e619fb845f40c2f482da55de52a987359",
  "specDigest": "7e53aa045e903a198b82c707c530465efc987d562b5e2b865bfa6ad91470dada",
  "tasksDigest": "60f33c8edf3bc98e0cbd86942462ff4e2fb68dd9a0ac3c5287aaaf91c0abf76f",
  "evidenceDigest": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  "knownGaps": []
}
```
