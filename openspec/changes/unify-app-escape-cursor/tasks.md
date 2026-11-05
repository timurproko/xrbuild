## 1. Approval and baseline

- [x] 1.1 Obtain plan approval, confirm Cursor choices and ordinary-browser fullscreen limitations, and resolve the prior task's committed baseline without moving dirty work; verify the approved decisions and dependency commit are recorded in this change.

## 2. Shared Escape behavior

- [x] 2.1 Add the shared Escape policy and lifecycle handler, replacing the return control's duplicate listener; verify unit tests cover all direct/return and windowed/fullscreen combinations, invalid context, repeat suppression, and disposal.
- [x] 2.2 Replace unconditional native Escape quit with page-scoped shell routing and graceful fullscreen-only direct closure; verify host tests cover navigation, reconnects, stale state, fallback, and no quit during a registered launcher return.
- [x] 2.3 Add bounded managed-browser fullscreen close handling and any required wrapper relay; verify API/browser tests reject foreign origin/source, wrong token, stale route, stopped session, and windowed close attempts and confirm runner state after closure.

## 3. Cursor setting

- [x] 3.1 Add persisted Settings > Apps > Cursor using shared form components and a validated core enum; verify default/migration, reload persistence, invalid writes, contribution filters, and next-run guidance.
- [x] 3.2 Resolve cursor choice through SDK options and both native/browser built/dev launch contexts, preserving it through launcher navigation; verify mode inheritance, input-disabled precedence, and invalid-value fallback tests.
- [x] 3.3 Coordinate SDK ring/dot and native/browser system pointer visibility; verify enabled versus disabled interactive targets, no double cursor, mono/stereo switches, physical scaling, idle hiding, and disposal restoration.

## 4. UI controls and showcase

- [x] 4.1 Add opt-in segmented re-selection fallback while retaining default radio behavior and idempotent programmatic selection; verify hand/mouse tests for X/X, Y/Y, Z/Z, switching axes, Full/Full, disabled controls, and exactly one change event per effective selection.
- [x] 4.2 Wire the showcase fallback and move sliders below the middle-row round button/robot/dial; verify real interaction tests, updated layout tests, README, and screenshots in both camera projections without clipped or overlapping labels.

## 5. Activity header

- [x] 5.1 Consolidate tabs, active filters, and X into a shared left/center/right header and remove both inner tools rows; verify browser tests cover both tabs, clear semantics, saved selections, filter counts and dynamic debug filters, empty states, keyboard access, and non-overlapping narrow/wide layouts while content remains item-only.

- [x] 5.2 Apply shared Settings gear tint and repair top navigation selection/focus clipping; verify rendered light/dark and narrow/wide regression tests cover the first card, scrolling, and keyboard focus.

## 6. Acceptance and handoff

- [ ] 6.1 Rebuild affected apps with this worktree's SDK and exercise the full native/browser Escape and cursor matrix; verify recorded manual results distinguish managed fullscreen windows from ordinary browser tabs and preserve every unperformed device check as a gap.
- [x] 6.2 Run focused SDK, UI control, panel, and host suites plus name guard and OpenSpec validation; verify passing results and align proposal, spec deltas, tasks, and PR outcomes before handoff, without merging or pushing to main.

## Verification record

- SDK: 164 tests passed, including cursor/input/projection combinations and simulated native mono/stereo changes. UI controls: 20 passed. Panel: 218 passed, 2 skipped. Launcher: 11 passed. Showcase: 3 passed.
- Fresh native Release build and host tests passed. Four actual Desktop sessions covered direct/return × windowed/fullscreen, disabled keyboard input, held Escape after return, and graceful cleanup.
- Real browser-engine tests covered the same Escape decision matrix with a controlled preview-process adapter, plus wrapper source/origin/session rejection. These are not proof of actual kiosk-window focus or closure.
- Settings/Activity browser checks cover 500/900/1500 px, both themes, keyboard focus, selected borders, persistence, dynamic filters, and clear semantics. Showcase screenshots at 1504×818 cover both camera projections with no clipped/overlapping labels.
- Launcher, Test and UI Kit were rebuilt against this worktree's SDK. Name guard, strict OpenSpec validation and diff whitespace checks passed.
- Task 6.1 remains open: actual owned fullscreen Browser window acceptance and physical stereo-display cursor/hand acceptance remain manual. Keep this PR draft until those results are recorded; do not treat simulated mode changes as device acceptance. Ordinary browser tabs retain their browser-controlled fullscreen/closure limitations.
