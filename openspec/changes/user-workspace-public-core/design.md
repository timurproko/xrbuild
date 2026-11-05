# Design

## Context

See proposal.md for why. State that shapes the approach:

- The panel finds everything relative to the repo root: `REPO` in `control-panel/src/env.ts`, `PROJECT_ROOTS =
  ['apps', 'tests']` in `projects.ts`, `plugins/` in `packagers.ts` and `host-build.ts`, the layout file at the root
  (`layout.ts`, renaming an older name on read).
- The host already searches `<exe>\plugins` plus every `--plugin-dir=` (`args.cpp`, `main.cpp`), and reports each
  plugin's folder to the page. No host change is needed for plugins outside the host folder.
- Plugin CMake projects already expose `XRB_PLUGIN_SDK`, `XRB_THIRD_PARTY` and `XRB_HOST_DIR` as cache variables,
  defaulting to paths relative to the repo; they install into `${XRB_HOST_DIR}/plugins/<name>`.
- Apps take the SDK through `"@xr-build/sdk": "workspace:*"`; the SDK and ui-kit have no build step (`exports` points
  at `src/index.ts`), and app Vite configs already `dedupe: ['three']`. The panel runs app scripts as
  `cmd /c pnpm run <script>` in the project folder (`panel.ts`).
- Packagers get a context with `runtimeDir` (host build output) and take plugin files from `runtimeDir/plugins`.
- `tools/check-vendor-free.mjs` holds its name list in plain text and allows `vendor-names-begin/end` blocks.
- `openspec/specs/` is empty; four in-flight changes hold all requirements, with vendor and client detail throughout,
  and still have open tasks.

## Goals / Non-Goals

**Goals:**
- A core checkout plus a workspace is the whole development setup; neither holds a path to the other.
- The core repo passes the name guard and an exposure scan, and is published with a fresh history.
- Everything already working (runs, builds, packages, camera view, icons) keeps working from the workspace.

**Non-Goals:**
- No package registry for the SDK, now or as a fallback.
- No change to the C ABI, the host channel or package layout on a station.
- More than one workspace at a time in the panel (switching is `XRB_HOME` plus a restart).
- CI and the PR workflow for the public repo: a follow-up change, once the repo exists.

## Decisions

### D1. Workspace at `%USERPROFILE%\.xr-build`, `XRB_HOME` to override
One resolver (`workspaceDir()` next to `dataDir()` in `env.ts`, mirrored in `fetch-deps`) used everywhere. Runtime
data (logs, CEF cache, run state) stays in `%LOCALAPPDATA%\XRBuild`: it is per machine and must not be versioned.
*Alternatives:* `Documents\XR Build` (synced by OneDrive on many machines, which fights `node_modules` and build
output); the core repo's parent folder (couples the two checkouts).

### D2. Sections are folders under `projects/`
`projects.ts` lists `<workspace>/projects/<section>/<name>` and `projects/archive/<name>`. A project's id is its folder
name (unique across sections), so it survives moves; saving a layout moves folders to match it, and `xrb-panel.json`
keeps only order, colours and archive origins. Earlier ids (`apps/x`) were dropped: two fixed folders plus a separate
section list put the same project in two places. The UI saves layouts as before. `REPO` stays for core-only paths (host build,
templates); a new `WORKSPACE` replaces it wherever user content is meant.

### D3. Workspace plugins: panel passes paths, plugins install into their own `bin/`
The host rebuild configures each workspace plugin with `-DXRB_PLUGIN_SDK=<core>/native/plugin-sdk`,
`-DXRB_THIRD_PARTY=<workspace>/third_party` and `-DXRB_PLUGIN_BIN_DIR=<workspace>/plugins/<p>/bin`. Plugin CMake files
install into `${XRB_PLUGIN_BIN_DIR}` (default: their own `bin/`), so source and build output stay in one plugin folder.
Runs pass one `--plugin-dir=` per plugin `bin/` (the host also scans a `--plugin-dir=` folder itself).
Plugins also get `-DXRB_CORE_THIRD_PARTY=<core>/third_party` for the core's own header-only dependencies
(nlohmann/json), which are not in the workspace's `third_party/`.
The host keeps the first plugin of a name it finds (`<exe>\plugins` before `--plugin-dir=`), so plugin folders left
next to the host by an older build would hide the workspace's copies: they mark the host outdated, and the rebuild
removes that build output.
*Alternative:* install into the core's host build folder as today; rejected because a host rebuild or clean would
mix user binaries into the core's build output and the freshness check would span two repos.

### D4. Packager context gains `pluginDirs`
The packager context gets `pluginDirs` (plugin name -> folder of its files: the plugin's `bin/`, from the host's
`--list-plugins`); packagers copy each selected plugin from there into the package's `plugins/<name>/`. When absent it defaults to
`runtimeDir/plugins`, so a packager written against the old context still works. Staging a merged runtime folder was
rejected: it copies the browser engine (hundreds of MB) on every package build.
A workspace packager that needs core modules (the default icon) loads them from `XRB_CORE`, never by a relative path;
the panel sets `XRB_CORE` in its own process before loading packagers.

### D5. SDK through `XRB_CORE` and a Vite alias
The panel adds `XRB_CORE=<core root>` to the environment of every app script. The template's `vite.config.js` maps
`@xr-build/sdk` and `@xr-build/ui-kit` to `${XRB_CORE}/packages/<pkg>/src/index.ts` and fails early with a clear
message when the variable is missing. `dedupe: ['three']` keeps one three.js. ui-kit's own dependency (`lucide`) is
resolved from the core's installed packages, which the core's `pnpm install` provides; the alias points at source
files inside the core, so Node resolution from those files finds the core's `node_modules`.
The panel writes `<workspace>/jsconfig.json` (ignored) with matching `paths` for editors on every start.
*Alternatives:* `link:` dependencies (stores a machine path in the app), a published package (rejected by the user),
a shared Vite config in the core imported by path (still needs the path in the app).

### D6. Workspace is its own pnpm workspace
The workspace root holds `package.json` and `pnpm-workspace.yaml` (`projects/*/*`, `plugins/*/packager`), so one
`pnpm install` there serves all apps and packagers. The panel runs `pnpm install` in the workspace when
`node_modules` is missing, as it already does for projects. The core's `pnpm-workspace.yaml` shrinks to `packages/*`
and `tools/*`.

### D7. Name guard over hashes
`tools/name-guard/` replaces `check-vendor-free.mjs`. Text is split into words on non-alphanumerics and camel-case
boundaries, lowercased; each word and each adjacent pair is hashed (SHA-256 over a fixed repo prefix plus the word)
and looked up in `banned.sha256` (one hash per line). Contents, paths and `package.json` names are checked. `add
<name>` appends the name's hashes to the core's list; no plain list is kept anywhere. The rule itself is written in
`CLAUDE.md` (agents) and `openspec/config.yaml` (planning). Enforcement: `pnpm check:names` in CI; a pre-commit hook installed by
`pnpm hooks` (sets `core.hooksPath` to a tracked `.githooks/`); a Claude Code `PreToolUse` hook on Write/Edit in
`.claude/settings.json` that runs the guard on the new content. No exception markers.
*Alternative:* keep the plain list outside the repo only (CI could not run it); encrypt it (needs a CI secret and
gives no more than hashes for this purpose).

### D8. Old names dropped from the core, converted once in the workspace
The readers between `vendor-names-begin/end` (old manifest and layout names, old environment variable, old SDK
aliases, old `fetch-deps` prefix) are deleted. The migration tool renames those files and keys in the extracted
workspace once, so the user's projects arrive in current form.

### D9. Migration by history extraction, core republished fresh
`tools/migrate-workspace` (kept out of the published core, see D10) runs `git filter-repo` on a clone of the current
repo, keeping `plugins/`, `apps/`, `tests/`, `archive/`, the panel layout and the in-flight OpenSpec changes, and
re-roots them at the workspace layout. The user pushes that to a new private repo and clones it to the workspace
location. The core is cleaned in this repo, then exported as a single fresh commit into a new public repo. The
current repo stays private as the full history.

### D10. OpenSpec split
The four in-flight changes go with the workspace (their open tasks are plugin and prototype work, and their text is
full of vendor detail). The core gets neutral canonical specs written directly to `openspec/specs/` for what the core
does: web host, plugin host, display/input/platform provider contracts, web runtime SDK, hand interaction and ui
controls, control panel, plus this change's three capabilities on archive. Open core tasks in the in-flight changes
(capability-aware SDK gestures) become a neutral follow-up change in the core. The migration tool itself names
plugins and lives only in the workspace repo after use.

## Risks / Trade-offs

- [Hashes of short words can be brute-forced from a dictionary] → The guard prevents accidental publication; it is
  not secrecy. Names that must stay secret should not be written into the core in any form, hashed or not; the guard
  report says so.
- [Common words as banned names cause false positives] → Pairs let a name be banned only in combination; single
  common words are refused by `add` with a warning unless forced.
- [Two repos drift: an SDK change breaks a workspace app unseen] → The panel builds apps against the live core; the
  core's CI cannot see the workspace, so the user's own rig run stays the check. Documented in `CLAUDE.md`.
- [A hand-configured plugin build still installs next to the host] → The default keeps working by design; the panel
  path always sets `XRB_PLUGIN_BIN_DIR`.
- [History extraction misses a file] → Before the public export, the exposure scan runs on the exported tree; the
  private repo keeps everything, so nothing is lost if a file is missed in the workspace.
- [Old packages in the field use old names] → Packages carry their own host; dropping old-name readers affects only
  development checkouts, which the migration converts.

## Migration Plan

1. Land the panel, tools and guard changes in this repo with the workspace resolver falling back to the repo (only
   while `apps/` still exists in the repo), so nothing breaks mid-way.
2. Run the migration: extract the workspace repo with history, convert old names, push it private, clone it to
   `%USERPROFILE%\.xr-build`, verify every project builds, runs and packages from there.
3. Remove `plugins/`, `apps/`, `tests/`, `archive/` and the in-flight changes from the core; remove the repo fallback;
   write the neutral docs and canonical specs; the guard passes.
4. Export the core tree, run the guard and the exposure scan on the export, create the public repo with one commit.
5. Rollback: until step 4, everything is in the private repo's history; step 3 is a normal commit that can be
   reverted.

## Open Questions

- Name of the private workspace repo on GitHub (does not change the design).
