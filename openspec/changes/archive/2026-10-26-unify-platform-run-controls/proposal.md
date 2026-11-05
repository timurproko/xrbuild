# Proposal

## Why

A project's run target and platform are currently selected in separate Settings and Build dropdowns. That permits a platform packager for one target to be paired with the other and makes it unclear which choice controls the app's run behavior. The primary action also changes its name for browser-based apps even though it serves the same purpose: try the app.

## What Changes

- Replace the two selectors with one connected **Platform** segmented control in Settings: Desktop (native standalone), WebXR (unpackaged headset/browser app), and the available platform providers or packagers. Identify a platform's native or WebXR target from its provider/packager metadata; do not hard-code plugin names.
- Preserve existing `target` and `platform` manifest fields. A deliberate Platform edit updates both together; merely viewing or editing another field does not rewrite them. A disabled selected plugin stays stored while the UI offers the matching standalone fallback.
- Show Platform, Display and Input vertically in the left Settings column. Put contextual display options (Fullscreen or 2D) alongside Display in the right column, stacking on narrow screens; keep the Dev server setting at the right end of the Settings header rather than the project header. Show Display and Input only for native selections; show the web Build button first, then Package title, Package version and Build package on one responsive row, with other package identity fields below, only when the selected packager is available for the effective target.
- Keep the primary button labeled **Run**. Native runs start the host; browser/headset runs open the built app in a browser. The panel must not claim it launched or can monitor a headset session.
- Preview the implementation locally from its task worktree before asking the maintainer to merge; do not edit the primary checkout.

Non-goals: launching a session remotely on a headset, making a localhost URL reachable from another device, changing plugin or package formats, and rewriting existing project manifests on load.
