# Design

## Context

See proposal.md for motivation. The supplied screenshots match the static description/loading paragraphs in `ui/calibration.html` and the centered Method/Start button row. `ui/calibration.js` mounts the optional browser contribution before revealing the cards.

`CalibrationTools` resolves one enabled contribution and checked service output. Its outer unavailable state covers catalog conflicts, absent/disabled owner, failed module resolution, invalid mount and changed contribution identity. Separately, `calibrationCapture.status()` catches every preparation exception and discards it in favor of the reported vague sentence. Default preparation checks bridge provenance/inventory and then resolves the service WebSocket dependency; it never enumerates devices.

`assertRuntimeSync()` can fail on source/path safety, absent or unreadable/malformed manifest, provenance/platform/source fields, unsafe inventory names/hashes, missing runtime files and file hash mismatches. Runtime directories include a source digest: the new marker scheduling header in PR 55 changes that digest, so an older staged runtime can appear simply absent in the new generation. These are not all dependency-installation failures.

PR 54's normal Rebuild prepares an already-activated stale/failed public service snapshot and refreshes plugin services before native host/plugin compilation. No installed service receipt means no automatic service preparation. The optional bridge has a separate reviewed dependency descriptor, builder and immutable staging path; ordinary native plugin rebuild is not that builder. Device DLL loading and inventory errors occur on explicit Connect/Start, not in the passive status probe.

## Goals / Non-Goals

**Goals:** Keep prerequisite identity and recovery information across core resolution, optional capture preparation and explicit device commands. Reuse shared loading, warning/error notices, controls and maintenance progress. Restore availability after an applicable Rebuild or accurately explain a real restart requirement.

**Non-Goals:** Automatically install/review a device SDK, weaken runtime validation, discover private binaries, start cameras on navigation, change calibration data or measurement algorithms, or touch the operator's running panel/workspace.

## Decisions

1. Remove the description rather than hiding it with CSS. Keep loading visible with the existing spinner and accessible loading status; remove it on success or failure. Align only feature layout using existing shared control sizing, not copied component styling.
2. Retain machine-readable prerequisite categories and short user-facing reasons with optional supported recovery actions. Distinguish missing/disabled contribution, recoverable service preparation, missing bridge, stale/invalid bridge, unsafe state and explicit device failures. Preserve diagnostic detail without dumping long internal exceptions onto the page. A catch-all remains only for genuinely unknown failures.
3. Approved addition: normal Rebuild must also rebuild/stage a previously built bridge for current source when its reviewed device dependency is present. Use a neutral declared plugin rebuild contribution, the existing logged job, selected core/workspace and desktop-validated compiler tools. Never download/provision the device SDK, overwrite unsafe runtime state or start devices. A missing dependency gets one sentence naming it; missing/stale bridge output with verified dependency offers Rebuild. Trace service preparation with and without an activated snapshot and refresh the idle calibration contribution after changed immutable generations, rather than leaving a stale identity refusal. Restart is offered only when loaded code truly requires it.
4. Keep plugin/capture failure separate so Import, Export and saved-result operations remain usable whenever their contribution is available. Recheck status after explicit recovery without starting capture.
5. Add focused injected-state regressions and isolated real-browser checks. Capture loading, loaded alignment, each changed unavailable notice/action and its recovery result in the crew task output folder. Use a disposable workspace/browser profile and free port, then stop every process started. Do not connect to the operator's panel or physical devices.

## Risks / Trade-offs

- Native runtime provenance is safety-sensitive → retain all existing path, manifest and hash checks and test refused states instead of deleting/resetting them.
- First failure can mask another prerequisite → report the first concrete blocker and recheck after recovery rather than claiming all prerequisites are healthy.
- Device-library loader failures may expose only a process error code → report the observed native failure honestly, with diagnostic detail, without guessing a missing SDK.
- Software-only fixtures cannot establish the operator's exact failing prerequisite or real hardware readiness → report the code paths and recovery sequence separately from verified browser behavior and list hardware-only checks.

## Migration Plan

No user-state migration. Deliver source/tests/docs together; rollback restores the old UI/diagnostics without rewriting preferences, profiles, projects or generated bridge output.
