# Design

## Context

The launcher has three relevant execution environments:

1. A Control Panel preview at a loopback URL, where the panel API supplies locally published workspace apps.
2. A separate loopback development server, where the production inventory is displayed but eligible routes may be replaced with local built output for testing.
3. A built launcher hosted by the native app runtime at a non-loopback local hostname, or published on the web. Both are product runtimes and should consume the canonical published inventory.

Today `isLocalPreview()` includes every `.local` hostname. The native app runtime therefore receives development placeholders. Its root path also cannot identify which published slug represents the launcher, so path-only filtering can leave the launcher in its own catalog. Separately, the launcher adds the SDK mouse cursor object to its scene, and the Control Panel's project context menu offers project organization actions but no explicit force rebuild.

## Goals / Non-Goals

**Goals:**

- Native desktop and published browser launchers show the same published app set and canonical routes.
- Empty slots and local route substitution remain available only for loopback development.
- The launcher never lists its own publication, including when native hosting uses `/`.
- Mouse and hand controls keep working without the visible launcher cursor ring.
- A developer can deliberately rebuild one app from its project-row context menu and inspect the background job.

**Non-Goals:**

- No offline cache or local fallback for the native launcher when the publication inventory is unavailable.
- No change to normal automatic builds before Run, package or Publish.
- No arbitrary build command supplied by the browser; the panel still runs only the manifest's validated script name.
- No removal of cursor support from the SDK or other apps.

## Decisions

### D1. Add a distinct force-rebuild project operation

The panel adds a project API operation that calls the existing browser-output rebuild path directly rather than `ensureBrowserBuild()`. This guarantees that **Rebuild** executes the validated manifest build script even when the current receipt is fresh, then finalizes the icon and rewrites/verifies the receipt through the existing code.

The context-menu action is present only when the project has a valid manifest and build script. As with existing context-menu availability rules, unavailable actions are omitted rather than disabled. Archived projects remain eligible because the panel already permits them to build. The response is the normal background job summary; the UI selects that job in Activity so progress and output are visible. The operation does not publish, package or run the app.

*Alternative:* reuse `build-web` without a force flag. Rejected because a current receipt intentionally makes that operation a no-op, which would not satisfy an explicit rebuild command.

### D2. Development means loopback, not every local-scheme hostname

A launcher development origin is limited to `localhost` or `127.0.0.1`. A Control Panel preview remains recognized by its loopback `/preview/<project>/` route. A native runtime hostname ending in `.local` is not a development preview: it loads the configured publication inventory, keeps canonical published launch URLs and never appends synthetic slots.

This rule is kept as a small pure helper that focused tests can exercise with loopback, native-runtime and published HTTPS URLs.

### D3. Compile the launcher publication identity into the app build

The launcher's Vite config reads its own validated publication ID and bounded slug and defines `VITE_XRB_PUBLICATION_ID` and `VITE_XRB_PUBLICATION_SLUG`. Catalog filtering accepts that identity in addition to path inference. Path inference remains authoritative for published routes, while the embedded stable ID covers native root hosting where `/` carries no publication identity and the publisher-specific slug may differ from the currently selected manifest route.

The filter removes only the matching ID/current route and leaves all other valid inventory entries intact. The slug remains a bounded fallback, and an empty root publication slug remains representable rather than being confused with a missing value.

*Alternative:* hardcode the launcher's route in source. Rejected because publication routes are manifest configuration and can change independently of the app code.

### D4. Do not add the SDK cursor object to the launcher scene

The launcher continues to bind mouse input and attach UI Kit controls to the SDK interaction manager, but it does not render `xrb.cursorObject`. This removes the white/blue ring only from the launcher. Pointer rays, card buttons, page controls and hand interaction do not depend on the cursor being a scene child.

### D5. Test slots remain a development fixture

Synthetic empty slots are appended only on loopback origins, including the panel preview and separate development server. Catalog failure on loopback may still show those fixtures for layout testing. Native and published runtimes show the real catalog or the existing unavailable/empty state, never fake unpublished cards.

## Risks / Trade-offs

- [Native desktop requires network access to the publication origin] → This is intentional: desktop is specified to mirror the published catalog, not silently substitute workspace builds.
- [A configured publication slug becomes stale during a long-running development server] → Rebuilding/restarting the app is already required for compile-time manifest context changes.
- [Removing the cursor reduces visual mouse-position feedback on a stereo display] → The user explicitly prefers no ring in the launcher; hover/press animation on controls remains.
- [Force rebuild conflicts with active work] → Existing job conflict rules reject unsafe overlap with an actionable error; no parallel bypass is added.
