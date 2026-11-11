## 1. Source and personal-state model

- [ ] 1.1 Add versioned, bounded source baselines and separate personal-state overlays without changing logical project identity; verify new-state fixtures distinguish source edits, inherited defaults and UI settings.
- [ ] 1.2 Add non-destructive legacy upgrade retaining the complete old generation and carrying validated personal choices into current installed inputs; verify settings-only legacy fixtures refresh automatically, unknown edits remain preserved and repeated upgrades/restarts are idempotent.

## 2. Automatic refresh

- [ ] 2.1 Stage and atomically publish current installed inputs under the existing project lock with baseline-aware added/changed/deleted-file handling; verify actual source bytes for upstream-only, local-only, identical concurrent and conflicting changes, including shared SDK/build inputs.
- [ ] 2.2 Preserve names/icons, provider choices, run defaults, deployment identity, recordings, scope and user organization across refresh and installed section relocation; verify field-wise preservation and rejection of incompatible/ambiguous state without product writes.
- [ ] 2.3 Route every effective source consumer through coherent refresh and current-output validation without mutating discovery or active consumers; verify development/build/native/browser/icon/package/publication entry points, rebuild requirements, pinned old output and absence of stale-source fallback.
- [ ] 2.4 Retain failure/race safety and containment on refresh; verify stale revisions, active leases, concurrent writers, input changes during staging, interrupted state, foreign roots and linked/hard-linked paths preserve all prior data and never publish partial state.

## 3. Normal UI and documentation

- [ ] 3.1 Remove the installed-sources banner, internal-path text, Keep my working sources control/handler and acknowledge-without-refresh endpoint; verify focused UI/API regressions show normal project controls and no alternate stale-code acknowledgement path.
- [ ] 3.2 Document pull/update behavior, legacy preservation and exceptional source-conflict recovery in current embedded-workflow docs/instructions; verify docs agree with implemented state transitions and do not imply automatic cleanup or discard of edits.

## 4. Verification and handoff

- [ ] 4.1 Run focused changed-code tests, public type checks, name guard and strict change validation; verify results and any skips/gaps are recorded without broad repeated acceptance claims.
- [ ] 4.2 Complete truthful PR outcomes and handoff while leaving trusted finalization, final-head CI and merge to their owners; verify the draft body includes specific acceptance outcomes and manual shortcut testing is either observed or explicitly left for the maintainer.
