## Context

Baseline: core main `1b261c1`, merged PR #14. Its archive and synchronized contracts are accepted. This work continues in `fix/jobs-scrollbars`; the added Hands/Design reports belong to this same new task.

`ui/scrollbars.js` owns native-overflow-backed overlays in a per-document manual-popover layer. Its current visibility predicate handles disconnected nodes, `[hidden]`, clipping and dialogs, but does not check CSS visibility. `design-system.css` deliberately sets the header/main to `visibility: hidden` during `workspace-pending`, so overlays can remain visible without visible content. `renderJobs()` replaces job detail nodes during refresh, and tabs keep mounted regions; these transitions also need explicit regression coverage.

Design Main is served in a sandboxed same-origin iframe inside `.design-stage { padding: 12px }`. The iframe document owns its scrollbar, putting it inward from the panel's viewport edge. That framing is valid for isolated workflow cases but should not produce inconsistent Main scrollbar geometry.

Hands currently re-exports the sample `tool.mjs`. Its top-level import of `managedBridgePlugin` imports `bridge/managed.mjs`, which statically imports `bridge/server.mjs` and `ws`. This optional dependency can fail before the tool serves any HTML. `ManagedTools` then supplies a centered 503 Retry page. The diagnostic is meant to support generated/browser use without a native bridge. Checked public dependency/build activation remains explicitly requested through the existing managed lane.

## Outcome 1: Functional visible-only shared scrollbars

Keep native overflow as the scroll engine and the shared per-document overlay owner. Correct visibility/eligibility and lifecycle handling in the shared module, not Jobs-specific scrollbar styling. Suppress overlays for CSS-hidden/pending content, closed output details, unmounted/hidden views, zero-sized/nonoverflowing regions and retired documents. Update after visibility/layout changes and restore after normal view or page-history re-entry. Dispose listeners/capture state for replaced regions; do not leave an interactive bar pointing at a detached or invisible node.

Reproduce the supplied state with synthetic Jobs data at a scrolled document position. Identify overlays by their controlled element, not merely their colour or position. Preserve a needed Jobs-list scrollbar when its bounded list actually overflows; preserve nested scrolling for long expanded output. Do not remove `overflow:auto` globally, erase job content, or change list limits/clear behavior to make bars disappear. Check wheel/track/thumb/keyboard scrolling against real `scrollTop` changes and page-vs-region targeting. Retain forced-colors/native fallback and no gutters.

Cover Jobs↔Log, Apps↔Plugins↔Settings, boot-time pending visibility, open/close output, live updates/filter/clear, resize, document departure/history restoration and a short nonoverflowing list. Shared hidden-region handling also applies to other tool/gallery consumers.

## Outcome 2: Apps/Design scrollbar parity

Use the same shared tokens, visible-overflow rules, right-edge geometry and input behavior for Apps and Design Main. Remove unnecessary Main framing inset around its scroll viewport rather than overriding scrollbar positions or introducing a second palette/controller. Preserve component content padding and navigation/header layout. Isolated workflow case frames may keep their required bounds; distinguish intentional content padding from a reserved scrollbar gutter.

Browser assertions compare the actual scroll viewport and visible bar right edge at identical viewport sizes/themes, before/after scrolling and when content fits. Exercise Main component filtering, case changes, nested scroll areas and narrow layouts. Preserve the gallery's mocked-only workflow actions and serving-origin navigation metadata.

## Outcome 3: Direct Hands view with optional services isolated

Separate serving the current checked diagnostic browser build from optional Node bridge/service creation. Make optional bridge import/setup lazy at its existing authenticated explicit endpoints, so an absent `ws`/native runtime cannot abort the normal generated viewer. Keep generated viewing/navigation available and report unavailable capture support inline inside the actual tool UI. Preserve existing authentication, source/owner selection, origin/frame restrictions, request bounds, cancellation and cleanup.

Resolve browser assets only from valid current installed public output through existing checked ownership/receipt rules. Do not silently adopt an old, stale, foreign, linked or validation-only snapshot, change the selected integration origin, or execute user/private packages to repair public dependencies. If the browser build itself is unavailable, retain the normal shared header/view shell with an honest inline explicit-setup/recovery affordance instead of the centered blocking Retry wall; do not claim an unbuilt viewer is ready. Use the existing explicit public service setup action for genuine missing build/dependency prerequisites. Merely opening the page must not install packages, compile/download assets, initialize capture/inference or restore a running recording/session. Actual service-code changes retain mandatory panel restart instead of hot-swapping already executed modules.

The neutral boolean tool declaration `independentView` opts into the shared unavailable-view shell when current browser output cannot be served. Hands declares it; unrelated tools keep their existing failure behavior. Limit any generic managed-tool interface change to neutral view-vs-service capabilities; never add a hand-plugin name branch to core. Preserve meaningful failure pages for unrelated tools unless they explicitly support independent viewer serving. Do not remove requested security/destructive/capture setup confirmations; the user request is about normal Hands navigation.

Verify a clean public-only setup, current ready browser build with an absent/broken optional bridge dependency, optional native runtime absence, true browser-output failure, rejected origins/mutations, no first-navigation install/device work and recovery/restart rules. Add real-browser assertions for the shared header/view and no centered Retry card, plus isolated frozen hand package tests and full diagnostic strict types as applicable. Physical/native/model acceptance remains a separately provisioned gap.

## Delivery

Three ordered task groups map one-to-one to PR Implementation outcomes. Write code/tests, tick and push each outcome and update its PR checkbox before starting the next. Run focused browser checks, strict TypeScript, name guard and strict change validation; run the applicable isolated public embedded/hand lane once. Plan publication precedes implementation approval. No private clone or primary running-process use is needed.
