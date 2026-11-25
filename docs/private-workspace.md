# Private workspace

How the ignored `.xrbuild/` clone relates to this repository. See [Confidentiality](confidentiality.md) for what may
never leave it.

- `.xrbuild/` is an independent private Git clone physically inside the checkout but ignored as a whole by core.
  It keeps its own `.git`, `package.json`, `pnpm-workspace.yaml` and LFS attributes/hooks. Never stage the clone,
  its Git metadata/private history or private binaries in core Git, and never enroll private packages in the core
  pnpm workspace. Public promotion is a separately approved, audited source snapshot, not a copy of the clone or
  a history merge. It is not a submodule or symlink.
- Provision each task's private clone explicitly; never junction the primary workspace into a task. Use `XRB_CORE`
  to select that task's core. Private uncommitted or unpublished work in a clone is never disposable.
- Core CI runs without private assets or credentials. Private dependency/runtime/integration checks belong to the
  private repository. See `docs/workspace-split.md` for staged migration and recovery. Detachment alone does not
  remove private history; keep hosting private until an isolated history audit and separate licensing review.
- **Update workspace** (panel menu, next to Rebuild; `pnpm update:repo` from a terminal) fetches, fast-forwards the
  selected workspace clone, runs `git lfs pull` and rebuilds; it never stashes, merges, rebases or discards, and never
  updates the core checkout. Rebuild stays build-only.
- `pnpm panel:repo`, `start-repo.vbs` and `pnpm fetch-deps:repo` explicitly select the current checkout's
  `.xrbuild/`. Explicit panel workspaces default to port 5181; user-mode panels default to 5180, and
  `XRB_PANEL_PORT` overrides either for that invocation. A port occupied by another workspace is refused, not reused.
  `pnpm panel`, `start.vbs` and plain `pnpm fetch-deps --workspace` retain `XRB_HOME`, else
  `%USERPROFILE%\.xrbuild`. The old `%USERPROFILE%\.xr-build` is not migrated; set `XRB_HOME` to keep using it.
  Never set a permanent `XRB_HOME` to the primary checkout: every other checkout would then use its workspace.
- Layout: `projects/<section>/<name>` (projects: a folder with an `xrb-project.json`; sections are the panel's sections,
  `projects/unsorted/` for none, `projects/archive/<name>` archived; folder names unique), `plugins/<name>`,
  plugin-owned originals under `plugins/<name>/samples/<sample>` (imported editable copies go to `projects/plugins/`),
  and `xrb-panel.json`; pinned `third_party/` assets use Git LFS. Ignored: `plugins/*/bin/`, `builds/`, `node_modules/`,
  `dist/`, `build/`, `jsconfig.json`. Never stage credentials, signing material, installed packages, compiled plugin
  binaries, runtime state or generated output.
- Read a plugin's own `DEVELOPMENT.md` before changing it; run its documented focused tests.
- Apps get the SDK from the core's sources, never from a registry: the panel sets `XRB_CORE` for app scripts and
  in its own process; the app's Vite config aliases `@xr-build/sdk` / `@xr-build/ui-kit` to it and dedupes three.
  Workspace code (packagers too) reaches core modules only through `XRB_CORE`, never by a relative path.
- Plugins build against the core with the CMake variables the panel passes: `XRB_PLUGIN_SDK`, `XRB_THIRD_PARTY`
  (selected origin's dependencies), `XRB_CORE_THIRD_PARTY` (core), `XRB_PLUGIN_BIN_DIR` (resolved output).
  Workspace plugins retain `plugins/<p>/bin/`; embedded plugin rebuilds use a core/source-scoped cache under the
  selected workspace's `build/native/`, never embedded sources. Incomplete/failed output is unavailable until a
  successful rebuild. Native provider roots are queried separately; conflicting or invalid roots are excluded from
  runs and package mappings. `--core-only` skips optional plugins; `--plugins-only` rebuilds plugins without writing
  the installed host/product tree. Managed full/core-only rebuilds use selected-workspace `build/native/h-<core-key>/b`
  and publish immutable `r-<generation>/` runtime snapshots. Receipts gate activation; failures never fall back to packaged
  output. Runs, provider queries, icon jobs, packages and CLI host tests use the selected snapshot. Old snapshots and
  product-side legacy plugins are not automatically removed; standalone developer CMake paths remain explicit.
  Rebuild checks desktop prerequisites through an optional checklist. Explicit consent-bound background setup uses
  fixed system packages, a verified official signed-bootstrapper fallback, or pinned fresh `build/native-deps/`
  generations. Toolchain installation is one grouped action; fallback verification/elevation uses fixed arguments,
  exclusive storage, bounded HTTPS downloads and a write/delete-denying verification lease. Checked receipts select dependency
  roots for managed host/plugin builds. Browsing never installs tools. Active setup excludes other jobs/native runs
  and panel quit/restart, preserves failures/foreign locks, and never requests an automatic reboot.
  Core Theme (System/Light/Dark) is immediate browser-local appearance, not a workspace/runtime preference.
  `/design` provides a Main shared-component catalog and isolated workflow cases with mocked-only installs/builds;
  old gallery links redirect. Same-origin previews share Theme. Its standard XR Build Design header/menu includes
  explicit shared Restart/Rebuild handlers (case frames remain mocked) and is exposed in app navigation
  only for Dev/repository launch mode, directly after Settings before the maintenance divider, never inferred from browser query or
  workspace preferences. Registered tools discover the same navigation metadata; managed documents replace stale
  build-time return-address tags with the serving panel origin. Managed tool aliases are bounded, reserved/collision-checked
  local GET/HEAD redirects owned by the selected plugin; short tool routes do not rename provider/storage IDs. Full worktree UX review needs independently provisioned
  task-local workspace data and explicit service setup, not the primary workspace or a synthetic gallery substitute. Preserve a
  running process's mode; never restart active work to change visibility. Keep component visuals in the shared design
  system, including compact xrb-choice-list rows, not copied fixture palettes. Shared scrollbars overlay document,
  nested and modal content without gutters while preserving native scrolling and forced-colors fallback; standalone
  static adapters must serve scrollbars.js and workspace-layout.js alongside design-system.js. Apps and Design Main use the shared workspace grid/sidebar/card-stack templates and document scrolling; only isolated workflow demos use preview frames. Layout sizing and rhythm belong in shared primitives, not product-specific copies. Small is the single reduced control size;
  primary buttons do not stretch by default, maintenance colors belong only to bulbs, and warning/error banners
  share geometry and typography.
  See `docs/desktop-setup.md`; actual administrative/native acceptance remains separately provisioned work.
