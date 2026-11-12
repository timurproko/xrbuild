## Context and evidence

Baseline is merged PR #13, core main `7bee3f0`; its sidebar/development-catalog change is archived and synchronized.

- `AppCard` in `embedded/projects/core/launcher/src/main.js` calls `show3d()` synchronously for generated default spheres. `show3d()` returns when `this.parent` is absent, which is always true during construction. Built template apps instead attempt an asynchronous `icon.js` import, explaining why first launch/build can change the visible result.
- `loadWorkspaceCatalog()` derives default-vs-model behavior from build availability but drops the panel's explicit `project.icon.model` URL. Cards call SDK `loadAppIcon(app.route)`, deriving an unpinned preview route rather than using the checked generation-specific model location.
- The panel preview handler can rebuild materialized embedded apps on an unpinned asset request, while ordinary project asset reads do not prepare missing output. This produces slow authored icons and different cold/warm behavior.
- `saveSettings()` submits whole manifests with captured revisions and opens Settings changed on disk for ordinary 409 responses. Platform and publication already have bounded field-specific rebase paths; general controls lack an equivalent queue/rebase policy. Server revisions cover embedded effective content/materialization and must not be weakened.
- `embedded/projects/unsorted/test` is a tracked snapshot of `templates/app`; its importer and embedded catalog tests/current docs assume it is shipped. User project creation already uses the canonical template independently.

## Outcome 1: First-presentation Launcher icons

Use an explicit card lifecycle/disposal state rather than scene-parent presence to distinguish live and destroyed cards. Synchronous geometry is valid before attachment. Late module/texture completions must never populate a destroyed card and must dispose unused resources. Preserve reveal animation, compact default scale, colour and authored model animation.

Separate logical icon presentation from whether a full app build has happened. A generated default sphere must be available immediately for a new template app; when an authored model is available it still wins over generic geometry. Do not label every app without a custom PNG as a template sphere: apps may author 3D icons without a custom bitmap.

Carry the checked model URL/readiness or equivalent bounded metadata in the local catalog. Use current generation-specific output for authored models and avoid importing through an unpinned app-page route. Include icon identity/readiness changes in catalog refresh signatures. Deduplicate loading, retain successful model preparation across routine refreshes, and allow a bounded retry after a transient failure without permanent failed-import caching.

For cold authored icons, perform necessary source-consuming preparation at an explicit run/preview/icon-preparation boundary under existing managed output/installation/lock rules, never by silently installing dependencies or launching destination apps from discovery/catalog GETs. Finish required preparation before claiming Launcher cards are ready, with visible loading during actual cold work. Do not promise zero network/compilation time. Existing usable custom images remain an immediate fallback during asynchronous authored model loading; default geometry must not wait for a model import or any app run. Prefer preparing only the icon's required graph; if the existing toolchain requires an app build, expose and deduplicate that cost before ready presentation rather than hiding it behind card imports. Use neutral capabilities/contracts, never a project-name branch in the engine.

Verification covers cold new template apps, warm built template apps, authored icons with and without a PNG, generation-pinned embedded output, colour changes, transient model failure/recovery and destruction during load. Include a real browser/render lifecycle check, not only source regex assertions. Native visual acceptance remains a separately observed maintainer check.

## Outcome 2: Ordinary settings without reload-modal interruption

Capture explicit field intent at the edit boundary and serialize/coalesce writes per qualified project identity. A later toggle must survive an earlier request completing, SSE catalog refresh or an unrelated form rerender. Build deltas from the actual touched fields (including dependent input/provider/desktop fields), not every value present in a stale form. Keep existing Platform/Publisher-specific identity and publication-route consent rules.

Use authoritative mutation responses/re-fetch to advance timestamps and complete content-bound revisions after saves and first embedded materialization. On a classified stale revision, fetch the latest manifest and retry only compatible field intent with bounded attempts. Preserve unrelated concurrent settings. Do not blindly replay whole manifests or retry every 409: busy operation locks, changed provider schemas, source conflicts, unsafe state and publication consent remain real failures.

Replace the routine reload modal with shared inline field/status feedback for unresolved settings conflicts and failures. Keep unsaved input visible when possible, accurately show whether it persisted, and offer an explicit retry/reload action when needed without forcing a modal. Same-field external conflicts must not silently overwrite another editor; unrelated changes may be safely rebased. Validation remains inline. Security and destructive/publication confirmations are not removed.

Verification covers first and subsequent embedded input edits, rapid multi-input toggles, display/monitor/provider settings, a pending save across project switch/SSE refresh, unrelated external changes and same-field conflicts. Assert no Settings changed on disk modal and no lost user intent. Retain server tests for stale same-timestamp saves, busy operations and invalid/unsafe state.

## Outcome 3: Retire only the bundled duplicate starter

Delete the core-owned `embedded/projects/unsorted/test` source subtree and its exact `embedded/pnpm-lock.yaml` importer, then update the current product inventory/tests/docs and embedded package/project counts. Do not alter historical active/archive plans, remove unrelated test infrastructure, or delete the selected user's projects named Test/test1.

Keep `templates/app` intact, including its 3D icon/theme, font notice and project-creation defaults. Replace the old embedded-copy-equals-template assertion with direct project-creation/template coverage. Verify a fresh New project action generates the expected editable app and icon without relying on an embedded starter.

Existing user-owned materializations, recordings, configuration and independently copied projects remain preserved; absent product discovery simply stops advertising the retired installed project. No runtime cleanup/migration is authorized.

## Delivery and verification

Three task groups map one-to-one to the PR Implementation outcomes, in order. Implement, write focused tests, tick/push each outcome and update only its PR checkbox before starting the next. Run strict TypeScript/name/OpenSpec checks and isolated managed Launcher/embedded validation as applicable. No private clone is needed. Use synthetic fixtures under the task worktree; never restart the active primary panel or use its private workspace for validation.
