# Design

## Context

See `proposal.md` for motivation. Relevant existing boundaries:

- `packages/control-panel/ui/app.js` renders Develop, conditional Publish and Build as `xrb-tabs`. Develop uses existing `field`/dropdown helpers and `saveSettings`; `settings-writer.js` serializes project writes and overlays pending changes.
- `packages/control-panel/src/projects.ts` owns manifest types and structural validation. `server.ts` handles revision-checked saves. Bundled apps use durable user-owned effective sources/settings, not writes to `embedded/` installed sources; see `docs/development.md`.
- UI Kit and Launcher export plain `uiKitTheme.defaultTheme` declarations and typed scene theme props. Launcher imports UI Kit's public app entry and currently mounts `<LauncherScene/>`. `mount.update` changes the existing React tree without reconstructing the SDK runtime.
- UI Kit's built-in theme IDs and definitions currently live in `packages/ui-kit/src/visual-theme.ts`. Panel discovery must not import graphics/runtime app code merely to obtain those IDs.
- Browser preview projection already uses route/token/session-scoped panel reads and same-origin broadcast delivery. Native managed URLs already carry panel/project/run context, and existing live projection controls must remain untouched. There is no existing generic component-settings transport.
- The current theme spec forbids panel selection as part of the earlier theme-only scope. This change explicitly revises that boundary; app-scene selector UI remains forbidden.

## Goals / Non-Goals

**Goals:** a small shared serializable choice contract, explicit library consumption, generic settings presentation and project-scoped delivery into existing scene props. Adding another library or supported choice parameter must not require panel-specific code.

**Non-Goals:** automatic source/import-graph inference, evaluating app modules during discovery, arbitrary settings widgets, a global library theme, runtime component loading, new dependencies, control/theme redesign, SDK render changes, app-scene settings UI or Theatre.

## Decisions

### 1. Use data-only declarations and explicit consumer references

Add optional manifest metadata for a library's exposed choice parameters and a consumer's library references/default overrides. Each parameter has a stable key, label, choice value/label pairs and default; each library is resolved by a stable origin-qualified project identity rather than its display name. Put reusable structural types and validation in a graphics-free module shared by discovery and runtime consumers. Expose typed declaration helpers/types to authors without requiring a mounted application.

Use manifest JSON as the discovery surface rather than importing TypeScript app barrels on the server. Extract the registered UI Kit theme IDs/labels into graphics-free data shared with the existing theme registry, or use a checked generated declaration from that data, so the panel's options cannot silently diverge from runtime themes. This changes metadata only, not theme definitions. A focused parity test checks registration, declaration and default agreement.

Launcher explicitly references UI Kit and maps the declared parameter to its existing theme scene prop through the generic binding. UI Kit may declare itself as a consumer only if exactly the same machinery suffices. No AST scanning, filename heuristics, special Launcher panel condition or global registry is needed. Stable library/parameter keys keep a second library or parameter declarative.

### 2. Keep selections in normal project settings

Add an optional `componentSettings` map to the consuming manifest, keyed by library identity then parameter key. Read precedence is saved value, consumer-declared default, library default. Missing fields do not trigger writes or migrations. Validate metadata structurally, then validate saved values against resolved library declarations at the existing settings API boundary.

Extend `saveSettings` only for the changed namespaced field and retain the existing settings writer/API/revision checks. Preserve all unrelated fields and other libraries' values. Use normal bundled-project effective settings/preparation and locks; do not introduce another config store or write product defaults. Invalid choices use existing field errors; unavailable declarations do not execute code or get silently replaced by another origin's library.

### 3. Add exactly one conditional Components surface

Insert Components immediately after Develop, before Publish/Build when present. Preserve the existing Develop label, actions, content and all other surfaces. Render library group headings and parameter rows using existing settings label/row/field/select primitives and spacing; use library display names and concise labels such as UI Kit / Theme / Default / Chamfer.

The new surface has no primary action, help text, explanatory notice, extra save button or confirmation. It autosaves exactly as the current project settings do. Surface state must be independent of platform selection: changing to Components must not change a project's display/platform or expose package/publish controls. On a project without exposed consumed parameters, invalid remembered Components state falls back to Develop and no extra UI appears.

### 4. Bind managed settings to the existing scene without remounting

Introduce a small generic settings snapshot/subscription helper, separate from SDK rendering. Extend the existing managed launch context and scoped read/delivery pattern to carry only the active consuming project's resolved values. Browser built/dev previews use the established preview route/token/session validation and live update lifetime; native managed built/dev launches use their existing panel/project/run context with equivalent active-run checks. Keep existing projection and hands messages unchanged. Only committed successful settings saves publish changes.

The runnable entry resolves the library values and calls `mount.update` with the same scene component type and its declared prop mapping, including Launcher's existing `theme` prop. A small generic prop binding keeps future supported parameters declarative rather than adding panel branches. Initial managed snapshots apply saved values on start; supported live paths subscribe and update without a new scene key, renderer or runtime. Standalone runs without managed context retain the plain declared defaults. Paths without an active live-settings connection use the initial selection on next start rather than starting an additional service or claiming live delivery.

The helper must bound and validate payloads, reject foreign/retired sessions, retain the last valid value during a transient disconnect, and release listeners/polling on pagehide/HMR/disposal. Do not invent a cross-project broadcast authority. Document which managed paths are exercised and distinguish next-start-only paths in the report, without adding UI text.

### 5. Focus proof on this change

Before implementation edits, capture the unchanged panel Develop view/tab strip and Launcher in Default and existing controlled Chamfer under matched viewport/catalog/assets. After implementation, capture the same existing view, the new Components tab, and Launcher after selecting each theme through saved project settings. Save screenshots and a short capture manifest under the crew task output folder, not tracked source. Use `chrome-devtools-axi` for browser checks after reading its help.

Targeted tests cover declaration validation and theme parity; consumer resolution and origin isolation; normal/bundled save roundtrips, conflicts and preservation; tab ordering/visibility and existing-surface invariance; saved startup values, live prop updates, state continuity and disposal. Reuse existing panel browser fixtures and component/theme fixtures. No full local test suite or native build is planned for a metadata/settings-only change.

## Risks / Trade-offs

- [Discovery metadata drifts from registered themes] → Share graphics-free registration data and require a parity test; do not maintain an independent panel theme list.
- [Bundled working state drops new metadata/settings] → Include portability, effective-manifest and refresh-preservation coverage in the settings outcome.
- [Settings write races overwrite another edit] → Reuse the serialized writer and existing revision/lock checks; test rapid changes and stale saves.
- [New surface changes platform choice or existing actions] → Separate Components selection from workflow platform mutation and compare unchanged surfaces in browser tests/screenshots.
- [Runtime updates reset Launcher or leak listeners] → Keep component identity and mount, exercise repeated theme changes and dispose/HMR boundaries with existing state fixtures.
- [Managed context leaks another project's values] → Reuse active session/origin checks and test retired/foreign scopes; never accept a bare project name as read authority.
- [Optional live delivery is unavailable on a non-managed launch path] → Apply the saved initial value at next supported start and record the exact path; no restart claim without evidence.

## Migration Plan

All fields are optional. Existing apps retain their defaults and show no extra tab until they explicitly declare consumption. UI Kit and Launcher opt in together. Update the component/app guides to replace their future-settings statements with the supported declarations and runtime/save behavior. Rolling back code leaves optional project values inert; no destructive migration or cleanup is required.
