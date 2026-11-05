## Implementation

- [x] 1. Implement return-only Escape in SDK/native routing and update documentation; verify direct/return × fullscreen/windowed tests, repeat suppression, disposal, and native build/tests.
- [x] 2. Add opt-in momentary segmented caps and remove showcase axis re-selection fallback; verify hand/mouse same-axis, Full, press/release and disabled controls.
- [x] 3. Share Apps favicon identity and detail-preserving sidebar tint; verify light/dark browser rendering keeps internal glyph detail.
- [x] 4. Balance Activity clear glyph inset without reducing its hit area; verify narrow/wide geometric browser checks and unchanged clear semantics.
- [x] 5. Unify independent publication status and action eligibility, locking published destination fields; verify fixture API/UI tests across host/web/platform targets, failed/pending status and unpublish confirmation without touching live publication.
- [x] 6. Rebuild affected showcase/runtime output and run regression suites, name guard and strict spec validation; verify results and explicit device acceptance gaps are recorded before handoff.

## Verification

- SDK: 164 passed; UI Kit: 22 passed; panel: 220 passed, 2 environment skips; Launcher: 11 passed; showcase: 3 passed. Total: 420 JavaScript passes.
- Native Release build and host tests passed. Six actual Desktop host cases passed: direct with/without SDK and launcher-return child, each windowed/fullscreen, with keyboard input disabled. Escape never closed the session; explicit window close cleaned up each test.
- Real browser fixture tests cover return-only Escape and bounded explicit-close rejection; preview child processes are controlled adapters, not actual kiosk acceptance.
- Settings/Activity checks passed in both themes at 500/900/1500px; glyph detail, optical inset and 28px hit target verified. Publication fixtures cover legacy package-specific unavailable status, failed-but-deployed/pending states, confirmation, republish and late HTTP responses after terminal job events.
- UI Kit, Launcher and Test output rebuilt against this worktree's SDK. Generated output remains ignored. Name guard, strict change validation and whitespace checks passed.
- Publication diagnosis used read-only live status only; all publish/unpublish requests were isolated fixture operations. Installed shortcut panels and real deployments were not changed.

## Manual acceptance gaps

- Actual managed fullscreen Browser/kiosk key behavior and physical stereo-hand press/release remain maintainer acceptance checks before merge. Automated browser adapters and synthetic hands do not establish those results. Ordinary browser fullscreen remains browser-controlled.
