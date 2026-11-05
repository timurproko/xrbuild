# Tasks

## 1. Workspace resolver and layout

- [x] 1.1 Add `workspaceDir()` (`XRB_HOME`, else `%USERPROFILE%\.xr-build`) and `WORKSPACE` to `control-panel/src/env.ts`, with a temporary fallback to the repo root while the repo still has `apps/`; verify with unit tests for the env override, the default and the fallback
- [x] 1.2 Add a `templates/workspace/` skeleton (`apps/`, `tests/`, `plugins/`, `archive/`, `.gitignore`, `package.json`, `pnpm-workspace.yaml`, `xrb-panel.json`) and a create function that only adds missing files; verify with a test that creates into an empty folder and one that leaves an existing file unchanged
- [x] 1.3 Add `templates/app/` (minimal three.js app with the SDK alias `vite.config.js`, `xrb-project.json`, `index.html`) that the panel does not list; verify by creating it in a temp workspace and building it with `XRB_CORE` set

## 2. Panel on the workspace

- [x] 2.1 Point project discovery, archive/unarchive and "create manifest" at `WORKSPACE` (`projects.ts`, `panel.ts`), ids unchanged; update `projects.test.ts` to use a temp workspace and verify it passes
- [x] 2.2 Read and write the layout at `<workspace>/xrb-panel.json` (`layout.ts`); verify with the layout tests against a temp workspace
- [x] 2.3 First-start empty state with "Create workspace" and "New project" (from `templates/app`), and show the workspace path in the top bar; verify in the panel UI against an empty `XRB_HOME`
- [x] 2.4 Run `pnpm install` in the workspace root when its `node_modules` is missing before an app script; verify a fresh workspace builds its starter app from the panel
- [x] 2.5 Update the panel's server/UI texts and `packages/control-panel` docs to say "workspace" instead of repo for projects; verify `node --test "test/**/*.test.ts"` passes in `packages/control-panel`

## 3. Workspace plugins

- [x] 3.1 Discover native plugins and packagers under `<workspace>/plugins` (`host-build.ts`, `packagers.ts`); verify with tests using a temp workspace holding a fake plugin and a fake packager
- [x] 3.2 Configure each workspace plugin with `-DXRB_PLUGIN_SDK`, `-DXRB_THIRD_PARTY` and `-DXRB_PLUGIN_BIN_DIR=<workspace>/plugins/<p>/bin` in the host rebuild; verify with the host-build tests and a rebuild that leaves the plugin in its own `bin/`
- [x] 3.3 Pass a `--plugin-dir=` per workspace plugin `bin/` on every panel run and check selected plugins there before a run (message names the plugin and offers Rebuild host); verify a run with a workspace-only input plugin and the refusal for a missing one
- [x] 3.4 Add `pluginDirs` to the packager context (default `runtimeDir/plugins/<name>`) and document it in `packagers.ts` and the packager contract docs; verify with a packager test that copies a plugin from `pluginsDir`
- [x] 3.5 Add `fetch-deps --workspace` (reads `<workspace>/plugins/*/deps.json` and lock files, fills `<workspace>/third_party`), and make plain `fetch-deps` core-only; verify with `node --test` in `tools/fetch-deps`, including the hash-mismatch case

## 4. SDK without a registry

- [x] 4.1 Set `XRB_CORE` to the core root in the environment of every app script the panel runs; verify with a panel test that inspects the spawned environment
- [x] 4.2 Template `vite.config.js`: alias `@xr-build/sdk` and `@xr-build/ui-kit` to the core sources, keep `dedupe: ['three']`, stop with a clear message without `XRB_CORE`; verify a build bundles one three.js and a build without the variable fails with the message
- [x] 4.3 Write the ignored `<workspace>/jsconfig.json` with matching `paths` on panel start; verify the file content with a test and editor resolution by hand
- [x] 4.4 Document the SDK supply (panel, plain terminal with `XRB_CORE`, editor) in `packages/sdk/README.md`; verify the documented plain-terminal command builds the starter app

## 5. Name guard

- [x] 5.1 Write `tools/name-guard` (word and pair hashing, contents, paths and package names, `add <name>` writing only the core hash list, warning on common single words); verify with `node --test` fixtures for a hit in text, in a file name, in a package name and a non-hit inside a longer word
- [x] 5.2 Replace `check:vendor-free` with `check:names` in `package.json`, delete `tools/check-vendor-free.mjs` and its marker exception; verify `pnpm check:names` runs
- [x] 5.3 Add `.githooks/pre-commit` (guard on staged files) and `pnpm hooks` to set `core.hooksPath`; verify a commit adding a banned name is refused
- [x] 5.4 Add a Claude Code `PreToolUse` hook for Write/Edit in `.claude/settings.json` that runs the guard on the new content; verify an agent edit adding a banned name is refused and leaves the file unchanged
- [x] 5.5 Seed the hash list from the user's names (vendors, products, clients, old project names, people) (no plain list kept); verify the guard reports today's tree (expected to fail until group 7)

## 6. Migration to the workspace

- [x] 6.1 Write the migration tool: clone, `git filter-repo` keeping `plugins/`, `apps/`, `tests/`, `archive/`, the panel layout and the four in-flight OpenSpec changes, re-rooted to the workspace layout; verify the extracted repo's `git log` keeps those files' history
- [x] 6.2 Convert old names in the extracted workspace once (manifest and layout file names, old manifest keys, old ProgramData and environment names in plugin configs) and update each plugin's CMake install line to `XRB_PLUGIN_INSTALL_DIR`; verify the panel loads every project with no migration warnings
- [x] 6.3 Point each moved app at the SDK alias (drop `workspace:*` SDK/ui-kit dependencies, update `vite.config.js`); verify every app builds from the panel
- [ ] 6.4 User pushes the workspace to a new private repo and clones it to `%USERPROFILE%\.xr-build`; verify on the rig that each app runs in 3D with hands and that one package builds and starts from the package folder without the workspace

## 7. Neutral core

- [ ] 7.1 Remove `plugins/`, `apps/`, `tests/`, `archive/`, the root panel layout file and the four in-flight changes from the core, shrink `pnpm-workspace.yaml`, drop the repo fallback from 1.1; verify `pnpm install` and all package tests pass
- [x] 7.2 Delete the old-name readers and aliases in `control-panel` (`projects.ts`, `layout.ts`, `server.ts`), `sdk/src/index.ts` and `fetch-deps`, with their tests; verify the package tests pass
- [x] 7.3 Rename the host test's unknown-provider name and remove tracker-specific comments in core sources (`plugins.cpp`, `main.cpp`, `.gitignore`); verify `host-tests.exe` passes
- [x] 7.4 Rewrite `README.md`, `CLAUDE.md`, `tests/README.md` content (moved where it belongs) and `third_party/README.md` around plugin roles and the workspace, including the two-repo setup and the SDK supply; verify `pnpm check:names` reports no hit in them
- [x] 7.5 Write neutral canonical specs in `openspec/specs/` for the core (web host, plugin host, display/input/platform provider contracts, web runtime SDK, hand interaction, ui controls, control panel) and a neutral follow-up change for the open core task (capability-aware SDK gestures); verify `openspec validate --specs --strict` passes
Note on 7.5: the open core task of the moved changes (capability-aware SDK gestures) is already implemented and
tested in the core (`packages/sdk/test/gestures.test.ts`, including the recording replay with capability bits
cleared), so no follow-up change is needed.

- [ ] 7.6 Run `pnpm check:names` on the whole core; verify it passes

## 8. Republish

- [ ] 8.1 Export the core's tracked tree into a fresh folder, run the guard and a full exposure scan (names, paths, emails, secrets, client material, asset metadata) on it; verify both report nothing
- [ ] 8.2 With the user: create the public repo, commit the export once with the user's GitHub no-reply identity, push; verify a fresh clone plus a workspace clone build the host, plugins and an app, and run it
- [ ] 8.3 Mark the old repo as the private archive in its README; verify its default branch states where the public core and the workspace live

## Workflow follow-up

- Archive this change in the public core after 8.2, so its three capabilities enter `openspec/specs/`.
- Next change: CI, PR workflow and docs auto-merge for the public repo (from the earlier overview).
