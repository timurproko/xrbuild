## Approved scope

Treat an absent, empty or uninitialized selected workspace as a valid browsing state. Remove Create your workspace markup, styling and handlers. Keep startup's brief loading/reveal state, but never substitute a setup overlay or auto-open New project. Preserve the normal embedded catalog and direct Plugins/Settings routes independently of workspace initialization. Empty ordinary user inventories retain the compact empty sidebar and explicit New project button.

## Lazy writes

The workspace API may continue reporting whether a package workspace has been initialized; this is information, not a UI gate. New project validates the requested folder and collisions before filesystem changes, then copies only missing root scaffold files from the combined or project-only template, creates the requested app and writes its editor mapping. It must not add the legacy Hello XR starter. Keep the existing explicit workspace-create API compatible; it is no longer part of startup or the browser UI. Existing embedded settings/build/configuration actions already prepare user-owned paths lazily and must work without a prior setup call. Move the unambiguous single-publisher default save from rendering to the explicit Publish-tab action, so restoring a remembered surface cannot initialize an absent root. Do not weaken writable-root checks, change frozen dependency policies for explicit repositories, touch installed embedded sources or create Git metadata.

## Read-only plugin discovery

The live public-product smoke check exposed eager default-config writes through plugin service context creation. Add a non-creating config-read mode for discovery: validate existing paths/configuration exactly as before, use validated in-memory defaults when absent, and retain exclusive first-creator behavior for explicit config initialization. Public service ownership checks must accept a missing but plain selected workspace path without creating it; preserve parent/link/source escape checks. Cover configured synthetic services in startup tests and run the two affected public modules' focused tests through the frozen embedded lane. Preserve the two safe default-config files already produced by the earlier live smoke; do not clean or replace user data.

## Selection and preservation

Default user path remains XRB_HOME or the user's .xrbuild directory. Explicit integration and project paths remain authoritative, even when absent. Separate project roots receive project-only scaffold; integrations are not initialized just to create a project. Existing files are never overwritten by scaffolding. Invalid names, collisions, linked roots and product-source destinations still fail closed. Normal startup/discovery must not create a missing root or initialize an empty one.

## Verification

Cover missing, empty, uninitialized and initialized roots with/without embedded apps; browse and reload without prompts or writes; visit Apps, Plugins and Settings directly. Explicit New project opens with Cancel/Escape, cancellation leaves roots unchanged, confirmation creates only the requested app and required scaffold, and reload selects it. Exercise existing-file preservation, invalid/colliding input, split roots and linked/product-root refusal. Verify an embedded settings write can lazily create its effective state without template scaffolding or a starter project. Run focused tests (real browser enabled), strict TypeScript, name guard and pinned strict OpenSpec validation.

## Delivery and prerequisites

Same branch/worktree and PR #6 as approved by the maintainer. The previous menu change was finalized by the bot at d22e25b and its repair is at 49dadac; preserve those commits and archived artifacts. This additive active change is linked for the next normal bot synchronization/archive rather than manually changing canonical specs or undoing earlier finalization. The maintainer's explicit scope approval precedes implementation; only the maintainer merges.
