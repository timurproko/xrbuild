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
- **Update** (panel menu, next to Rebuild; `pnpm update:repo` from a terminal) independently updates the running
  core checkout and the selected workspace clone to each `origin`'s freshly discovered/fetched default branch.
  Workspace LFS content downloads before its fast-forward; native plugins then rebuild, plus the host when outdated.
  Each repository reports full before/after commits; already up to date requires a fresh successful fetch.
  A refusal/failure in one repository does not prevent the other attempt, but the overall job fails with both results.
  A shared core/workspace checkout is updated once. Rebuild stays build-only; Update never stashes or discards work.
  Setup and recovery details are below. The updater refuses every uncommitted
  tracked/staged/untracked change (including non-conflicting edits), detached HEAD and local-only commits.
  A removed or non-default upstream is not migrated automatically: preserve local work and safely switch to the
  advertised default branch with matching origin tracking, then retry. Never discard work to satisfy Update.
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

## Update and recovery

Update uses `origin` explicitly, discovers its advertised default branch (not a hard-coded branch name or cached
`origin/HEAD`), fetches that branch even with a narrow refspec, and fast-forwards to the captured fetched commit.
Remote changes after that fetch are picked up on the next Update. Cached menu hints are not proof of remote
currentness: only a successful fresh fetch can produce the job's already-up-to-date result.

The checked-out branch must be the advertised default and track its matching origin branch. A stale local branch
tracking a deleted upstream is an attention result, not success. Preserve local/unpublished work, safely select the
reported default branch and configure its matching tracking branch, then retry. Update never switches branches,
stashes changes, resets, forces refs or reconciles divergence on your behalf. Dirty tracked, staged, untracked and
locally deleted files all block that repository, including non-conflicting edits.

Loaded plugin services are not a prerequisite for Git recovery: stale JS, missing runtimes and restart-required
service discovery do not veto either repository's attempt. Active plugin mutation/consumption, settings writes,
cache maintenance, desktop setup, running/starting apps, another job or panel shutdown still exclude Update.
After the desktop-busy check, Update reserves its job synchronously before any status/Git await; native launches,
browser previews and a second Update honor that reservation. An older status read drains first; later status
requests reuse the cache while Update runs (before the first snapshot they return only the updating flag).

After pulling, Update runs these visible steps:

- Workspace LFS: `git lfs fetch origin <captured-commit>` before checkout, honoring clone fetch exclusions. Core
  requires LFS only if its fetched tree uses LFS. A failed download leaves that repository's HEAD unchanged.
- Changed public dependency inputs: a fresh `node tools/panel-bootstrap/update-setup.mjs` runs the exact pinned pnpm
  manager with `install --frozen-lockfile --ignore-scripts --ignore-pnpmfile`, disabled user/global npm config and a
  sanitized environment. It validates the same public graph and permissions as shortcut setup; local `.npmrc`,
  unsupported graphs, network/lock/manager failures require explicit recovery. Private JS packages are not installed.
- Native builds: a fresh `node packages/control-panel/src/update-rebuild.ts --workspace=<selected-workspace>` loads
  the fetched recipe, checks host freshness and runs the existing CMake configure/build Release path for plugins,
  plus the host only when missing/outdated. Existing tool discovery is reused; no native prerequisites are silently
  installed. No native tests are run by Update.

The output retains each repository's full before/after commit, even after setup/build failure. Completed pulls are
not rolled back. Pending markers under each repository's Git metadata cause the next Update to retry setup/build
at an unchanged HEAD; markers clear only after that work succeeds. A separate dependency receipt records the
fingerprint of public inputs last successfully installed, independently of the pending update's original commit.
It is invalidated before installation and only renewed after success, so reverted dependency inputs on a later
retry are prepared again even when they match the original commit. Missing receipts are conservatively prepared.
A refusal in either source defers builds that would consume unsafe local work, without undoing the other source's
successful pull.

Update does **not** restart the running panel. Whenever core HEAD changes, its last job-output line explicitly says
**Restart required**, including when setup, rebuild or the workspace fails afterwards. Workspace source changes also
conservatively require Restart so loaded plugin code is replaced. The warning remains latched in that process
across subsequent Update jobs, even when disk commits are already current and build markers have cleared; only
starting a new panel process clears it. Choose the existing panel **Restart** action after resolving failures;
browser reload alone does not reload the running server's modules.

Older panels with the workspace-only Update implementation cannot install this fix by pressing their Update button:
they never fetch core. For the first upgrade only, inspect and preserve core local work, manually fetch its remote
default branch and fast-forward a safe matching local branch, then restart the panel (the shortcut can repair public
app dependencies). If the old upstream was removed, safely select the new default first rather than repeatedly
pulling the removed branch. Subsequent Update runs use the two-repository behavior above.
