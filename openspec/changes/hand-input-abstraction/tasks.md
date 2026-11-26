# Tasks

Implementation is not authorized yet. Groups match PR Implementation outcomes in order. Position/size/appearance and all laboratory features are follow-ups, not tracked implementation in this change.

## 1. Origin-aware skeleton registry

- [ ] 1.1 Validate bounded version-one handProviders declarations and normalize owner-qualified descriptors; fixture tests reject duplicate IDs, wrong role/ABI and foreign binary ownership.
- [ ] 1.2 Adapt undeclared validated native inputs and core simulated/replay/WebXR sources without changing ABI/wire layouts; catalog fixtures cover aliases, disabled/missing/unbuilt sources and context availability without capture or writes.
- [ ] 1.3 Declare the embedded synthetic source explicitly and document the neutral declaration contract in docs/embedded-extensions.md; public metadata validation passes without private source/runtime access.

## 2. Global source state and resolution

- [ ] 2.1 Add bounded revision-aware Hands profile storage/API with locking, containment and atomic replacement; isolated tests cover missing-state no-write, unsafe/malformed/oversized files, unknown fields and stale-writer preservation.
- [ ] 2.2 Implement one context-aware source resolver and preparation snapshot/lease; fixtures prove two project repositories share the choice, no automatic source/fallback, one logical source and immutable running/preparing snapshots.
- [ ] 2.3 Document state ownership and installed-versus-running states; tests cover synthetic/replay configuration and unavailable saved selections without hardware discovery.

## 3. Core Hands picker and logical Input presentation

- [ ] 3.1 Add core-owned Hands navigation/route and provider picker with explicit Save, availability/reasons and next-launch guidance; browser fixtures cover zero providers, absent optional viewer, saved missing source and revision conflict.
- [ ] 3.2 Move bundled acquisition diagnostics to a separate route/label with legacy Hands redirect and retained endpoints/state; navigation/server tests reject route shadowing and navigation starts no capture/runtime/install.
- [ ] 3.3 Present only Mouse, Keyboard and Hand in app Input with context-aware availability and legacy notices; UI tests retain unavailable saved selections and document the boundary between picker and future live lab.

## 4. Explicit legacy adoption without behaviour changes

- [ ] 4.1 Normalize concrete input and aliases in memory across manifests, platform choices and old personal run settings; fixture byte checks prove reads/runs do not rewrite files and old single-source launches retain provider/config despite another global choice.
- [ ] 4.2 Add explicit version-two input-save/adoption and acknowledgement for changed/unset global sources, without per-app provider fields; tests cover unrelated saves, legacy multi-source preservation/consolidation and old WebXR auto-hands compatibility.
- [ ] 4.3 Preserve embedded effective-manifest refresh/copy/personal-field rules and schema-bound provider overrides; fixtures cover both origins and document migration/rollback without modifying installed sources or private integrations.

## 5. Shared runtime ingress and resolved package closure

- [ ] 5.1 Use the resolver for native built/dev launch and checked package dependency/config staging; mocked spawn/package tests prove logical hand never reaches a native provider lookup and only the selected owner enters portable output.
- [ ] 5.2 Deliver versioned source policy to managed browser/dev/publication and launcher navigation; fixtures prove native/browser mismatches fail, source choice is frozen offline, legacy browser policy remains intact and trusted-return tests still pass.
- [ ] 5.3 Route native and WebXR ingestion through one identity stage before unchanged HandInput processing, gate only adopted logical policy and reset retired sessions; SDK fixtures preserve native capability/gesture traces and reject late retired-session delivery without altering HANDS v1/v2 or recordings.
- [ ] 5.4 Document the shared future adjustment/layer attachment points and current limitations in SDK/owner docs; targeted integration fixtures cover a pre-change application launching the same source/settings and unchanged pinch/grab behaviour after upgrade, without devices or the live panel.
