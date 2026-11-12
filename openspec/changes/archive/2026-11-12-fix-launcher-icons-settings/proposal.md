## Why

Launcher cards can remain as initials until an app is run: synchronous default geometry is rejected before its card is attached, while authored models are loaded through unpinned app routes that can require a full build. Ordinary settings edits also surface a blocking reload modal for recoverable stale revisions. The embedded Test app duplicates the normal new-project template and is no longer wanted in the shipped catalog.

## What Changes

- Show generated default 3D icons on first card presentation without building or launching the app, retaining selected colour and compact sizing.
- Resolve authored 3D icons from checked model metadata/output, prepare cold required inputs through explicit managed action boundaries, and avoid silent initials/full-build delays in ready cards. Preserve useful image fallback and bounded failure/retry behavior.
- Queue ordinary setting edits per project and reapply only intended field changes against authoritative revisions when safe, without the routine Settings changed on disk modal. Keep genuine conflicts, validation errors and busy/unsafe state non-destructive and visible inline.
- Remove only the tracked embedded Test app, its package-lock registration and current catalog/documentation assumptions. Keep templates/app and ordinary New project creation, generated 3D sphere, colour behavior and required license notices.
- Preserve existing independently created projects and retained user-owned embedded working state; removal of a shipped app is not permission to delete user data or historical plans.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `dev-control-panel`: first-use Launcher icon readiness and non-blocking ordinary settings saves.
- `bundled-extensions`: retire the duplicate embedded starter while preserving on-demand template project creation.

## Impact

Core control-panel project/icon metadata, preview preparation and settings UI; approved embedded Launcher rendering/catalog/tests; removal of embedded/projects/unsorted/test and its importer; current product documentation and template-creation tests. The generic SDK icon loader may need a backward-compatible lifecycle/cache adjustment if investigation requires it. No private workspace changes, host/device rebuild, private export, publication deployment or running-process restart is planned.
