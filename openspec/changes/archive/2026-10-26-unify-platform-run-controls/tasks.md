# Tasks

## 1. One Platform choice

- [x] 1.1 Derive the Settings Platform buttons from native providers and target-aware packagers, including Desktop and WebXR, as one connected control with a visible and accessible active choice that scrolls horizontally on narrow screens; verify in a browser with both targets, a packager-only plugin and the segmented control scrolled beneath the sticky column header.
- [x] 1.2 Save a deliberate Platform change as an atomic `target`/`platform` update without changing other manifest fields, while preserving disabled selections on unrelated edits; verify with panel tests for legacy, disabled and target-switching manifests.
- [x] 1.3 Remove the duplicate Build Platform dropdown, align Platform/Display/Input vertically and display options alongside Display, show native-only controls with Dev server in the Settings header, put web Build before a single responsive Package title / Package version / Build package row while keeping other identity fields visible, and show target-appropriate package fields, and give unavailable selections an accurate warning; verify by switching between native, unbuilt, browser-only and packaged WebXR projects at wide and narrow widths.

## 2. Consistent Run action

- [x] 2.1 Label the primary action Run for both kinds of project, dispatch native runs to the host and WebXR runs to the built app's browser preview without claiming a monitored headset session; verify with focused panel tests and a browser click check.
- [x] 2.2 Keep Build-first and stop/running behavior accurate for each choice and avoid showing native host controls on browser runs; verify with a fresh unbuilt app, a native run and a WebXR browser preview.

## 3. Local preview and checks

- [x] 3.1 Run the panel from this task worktree against the existing workspace without editing the primary checkout, and give the maintainer its local URL before merge; verify the panel reports the worktree as its core and all projects remain visible.
- [x] 3.2 Run the control-panel suite, JavaScript syntax check, name guard and diff check; verify all pass and report any device-only checks as gaps.
- [x] 3.3 Shorten the empty Log message to match Jobs without changing filtered-empty messaging; verify by switching Activity tabs with no entries and with filters applied.
