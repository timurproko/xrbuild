# Conditional implementation acceptance

Verdict: accepted only when an authorized human directly merges the containing exact pull-request head after required current-head validation, explicitly asks the active agent to execute that protected exact-head merge while it is currently eligible, or personally enables native auto-merge for the unchanged head and GitHub integrates it after validation succeeds.

The maintainer integration decision accepts these scenarios:
- The SDK remains the only owner of renderer output, frame clock, managed projection, stereo, WebXR and input.
- Component updates run once per SDK frame without independent Fiber drawing, output resizing or XR loop replacement.
- SDK-picked pointer and physical-target hooks preserve capture, cancellation and emulated-hand deduplication.
- Hello Cube retains its exact scene and controls with separate run and side-effect-free public component exports.
- Relative production assets, the standalone icon entry and build-time component reuse preserve vanilla app compatibility.
- Strict Mode, HMR and cancelled setup retain one live owner, and component teardown never loses borrowed contexts.

```openspec-delivery
{
  "version": 3,
  "repository": "timurproko/xrbuild",
  "change": "react-foundation",
  "sourcePr": 67,
  "archive": "openspec/changes/archive/2026-11-27-react-foundation/",
  "acceptanceManifest": "openspec/changes/archive/2026-11-27-react-foundation/acceptance.md",
  "finalizedDate": "2026-11-27",
  "specBaseSha": "d56e18be84bb7aca296cbebb13c2df1cd592d39b",
  "acceptanceScenarios": [
    "The SDK remains the only owner of renderer output, frame clock, managed projection, stereo, WebXR and input.",
    "Component updates run once per SDK frame without independent Fiber drawing, output resizing or XR loop replacement.",
    "SDK-picked pointer and physical-target hooks preserve capture, cancellation and emulated-hand deduplication.",
    "Hello Cube retains its exact scene and controls with separate run and side-effect-free public component exports.",
    "Relative production assets, the standalone icon entry and build-time component reuse preserve vanilla app compatibility.",
    "Strict Mode, HMR and cancelled setup retain one live owner, and component teardown never loses borrowed contexts."
  ],
  "archiveDigest": "4b147b97a834635595fd353213f42b699d9ce09ec5201a827939fddb2eab9689",
  "specDigest": "6c78342a45ed6c30819f1d0df75316de647eaae6ff8314ed0e2ef5c85ae2aac2",
  "tasksDigest": "0890220d65e1579fb89225789ad8152632214c16c1baeaa616cadb6ff9a6fec4",
  "evidenceDigest": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  "knownGaps": []
}
```
