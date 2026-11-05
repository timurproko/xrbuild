# XR Build

Runs three.js web apps on 3D displays with hand input, and packages them for station platforms. The **core**
(engine) is the host, plugin ABI, SDK, ui-kit and control panel. Displays, inputs, platforms and packagers are
providers behind abstract contracts; every concrete integration is a plugin. Authorized developers separately clone a
private development **workspace** at the ignored `.xrbuild/` path (see [Workspace](#workspace)). It owns its Git
history and instructions; read its `CLAUDE.md` and each affected plugin's instructions before private edits. Ordinary users use `XRB_HOME`, else `%USERPROFILE%\.xrbuild`; explicit
repository-development commands or the separate XR Build Dev Start-menu shortcut select this checkout's `.xrbuild/`. The plan lives in OpenSpec (`openspec/specs/`, `openspec/changes/`).

## Git

- Never add a `Co-Authored-By: Claude` (or any Claude/Anthropic) trailer to commit messages,
  and no "Generated with Claude Code" lines in commits or PR descriptions.
- Commit only when asked.
- Keep commit messages concise: a short subject line, then a few bullets only if needed.

## Changes and pull requests

- Every change follows the `change-delivery` skill (`.claude/skills/change-delivery/SKILL.md`): own worktree and
  branch, plan first as a draft PR, implementation after the maintainer approves, OpenSpec finalization in the PR by
  the repo bot, handoff, cleanup. Agents never merge, arm auto-merge or push to `main`; the maintainer merges.
- Commits and PR titles: `type(scope): subject` (scope: `host`, `plugin-sdk`, `sdk`, `ui-kit`, `app-icon`,
  `panel`, `templates`, `fetch-deps`, `name-guard`, `openspec`, `ci`, `claude`, ...). The PR title becomes the
  squash commit on `main`.
- Core changes reach `main` only through a PR: the `protect-main` ruleset (squash only, required check "CI required")
  and the other repository settings are declared in `config/github-repository-governance.json`; change them there and
  apply with `pnpm governance apply --confirm apply-xr-build-governance`.
- Workspace-only changes belong exclusively to the independent private repository: the maintainer uses ordinary
  Git inside `.xrbuild/`. There is no workspace main-push exception or workspace-push command in core. Agents
  never push to `main` in either repository and never use an admin bypass to merge a PR.

## Names stay out of the core

- Never use a proprietary name - a vendor, product or SDK, client, person, or where code came from - in core files,
  paths outside `.xrbuild/`, OpenSpec artifacts or commit messages. Describe the role instead ("a 3D display", "a hand
  tracker", "a station platform"); in examples use made-up names (`stereo-panel`, `tracker`, `station`). The entire
  private `.xrbuild/` clone is outside the core naming rule: plugin paths, project samples, manifests and
  pinned LFS dependency filenames may use external names. No `.xrbuild/` exception applies to core contents.
  Do not publish `.xrbuild/` or its LFS objects as part of a public export.
- `pnpm check:names` (`tools/name-guard`) enforces that boundary from hashes only (`banned.sha256`, no plain list anywhere);
  a Claude Code hook refuses such edits and `pnpm hooks` adds a pre-commit check. To ban another name:
  `pnpm names add <name>` (`--exact` for one whose lower-case form is an ordinary word), then commit the hash file.
- A concrete integration belongs in the selected workspace (`.xrbuild/plugins/<name>` for repository development),
  never in the core. Core features are
  generic and reach plugins only through the C ABI (`native/plugin-sdk/include/xrb_plugin.h`), the host channel
  and the packager contract (`packages/control-panel/src/packagers.ts`). A plugin-specific need is a plugin key
  (`--plugin.<name>.<key>=`), a capability or a new neutral ABI call, never a plugin branch in the core.
- Docs and specs describe roles ("a display plugin", "a station platform"), not plugins.

## Layout

- `native/host` - `xrb-host.exe`: CEF off-screen browser -> frame on the display (side by side for a 3D display);
  eye poses, hand stream and display info go to the page over a loopback WebSocket ("host channel").
  Display, input and platform are providers: built in (`desktop`; `none`/`replay`/`simulated`) or plugin DLLs
  found in `<exe>\plugins\<name>\` and every `--plugin-dir=`. `<exe>\xrb-app.json` names the providers a
  packaged app starts with.
- `native/plugin-sdk` - the C ABI header plugins build against.
- `packages/sdk` - `@xr-build/sdk`, JS SDK for three.js apps (`createXrb()`: stereo rig, hand input, pointer emulation;
  without a host, a WebXR headset session with the headset's hands and a virtual panel, `src/webxr.ts`).
- `packages/ui-kit` - `@xr-build/ui-kit`, 3D controls on the SDK's interaction core.
- `packages/app-icon` - app icons: default icon and colours, `.ico`, `app-icon render` (the app renders its own icon).
- `packages/control-panel` - local control panel (Node server + browser UI, 127.0.0.1:5180 for user mode,
  5181 for explicit workspaces) over the workspace:
  projects, web and package builds, runs with live status, camera view, icon studio, "Rebuild host" (host +
  workspace plugins). User mode: `start.vbs` or `pnpm panel`; repository mode: `start-repo.vbs` or `pnpm panel:repo`.
- `templates/workspace`, `templates/app` - what the panel creates: a new workspace, a new app.
- `tools/fetch-deps` - native binaries with pinned SHA-256s: the core's into `third_party/`, the workspace
  plugins' (`--workspace`) into `<workspace>/third_party/`.
- `tools/name-guard` - the name guard (hashes in `banned.sha256`).
- `tools/worktree` - `pnpm worktree add|enter|remove|sweep|handoff`: task worktrees in `.worktrees/` share only
  fetched core dependencies. Private workspaces must be cloned independently; builds stay worktree-local.
  Cleanup refuses `.xrbuild/` or `.artifacts/KEEP`, even with clean outer Git status; sweep preserves them as dirty.
- `tools/pr-automation` - the PR body link (`pr-body.mjs`), delivery check, OpenSpec finalization, docs auto-merge,
  unarchived-change report and nightly triage that the workflows run.
- `tools/repo-governance` + `config/github-repository-governance.json` - repository settings as code (`pnpm governance`).
- `.github/` - CI (`ci.yml`: ready PRs keep fast selected checks; full Windows host build/tests run nightly on
  `main` or by explicit CI dispatch, not on PRs or `main` pushes), the bot workflows (OpenSpec finalization and
  reconcile, docs auto-merge, nightly triage, bot probe; App token from `actions/app-token`), PR template.
- `.xrbuild` - ignored independent private clone: projects, plugins and pinned Git LFS dependencies, with its own
  `.git` and LFS hooks; credentials, installed packages and generated builds stay ignored in that repository.
- `tools/add-to-start.vbs` - adds the ordinary "XR Build" user-workspace shortcut; `--repo` and `--user` can
  explicitly retarget that shortcut. `tools/add-dev-to-start.vbs` adds a separate "XR Build Dev" shortcut that
  invokes the stable checkout's `start-repo.vbs`. Install Start-menu shortcuts from a stable checkout, not a
  disposable task worktree; use the task worktree's repository launcher directly for task-specific development.

## Workspace

- `.xrbuild/` is an independent private Git clone physically inside the checkout but ignored as a whole by core.
  It keeps its own `.git`, `package.json`, `pnpm-workspace.yaml` and LFS attributes/hooks. Never add its projects,
  plugins, Git metadata or binaries to core Git or the core pnpm workspace. It is not a submodule or symlink.
- Provision each task's private clone explicitly; never junction the primary workspace into a task. Use `XRB_CORE`
  to select that task's core. Preserve private uncommitted/unpushed work and move the private clone separately
  before core worktree cleanup. Mark important ignored artifacts with `.artifacts/KEEP` until separately preserved.
- Core CI runs without private assets or credentials. Private dependency/runtime/integration checks belong to the
  private repository. See `docs/workspace-split.md` for staged migration and recovery. Detachment alone does not
  remove private history; keep hosting private until an isolated history audit and separate licensing review.
- `pnpm panel:repo`, `start-repo.vbs` and `pnpm fetch-deps:repo` explicitly select the current checkout's
  `.xrbuild/`. Explicit panel workspaces default to port 5181; user-mode panels default to 5180, and
  `XRB_PANEL_PORT` overrides either for that invocation. A port occupied by another workspace is refused, not reused.
  `pnpm panel`, `start.vbs` and plain `pnpm fetch-deps --workspace` retain `XRB_HOME`, else
  `%USERPROFILE%\.xrbuild`. The old `%USERPROFILE%\.xr-build` is not migrated; set `XRB_HOME` to keep using it.
  Never set a permanent `XRB_HOME` to the primary checkout: it would bypass task worktrees.
- Layout: `projects/<section>/<name>` (projects: a folder with an `xrb-project.json`; sections are the panel's sections,
  `projects/Unsorted/` for none, `projects/archive/<name>` archived; folder names unique), `plugins/<name>`,
  plugin-owned originals under `plugins/<name>/samples/<sample>` (imported editable copies go to `projects/plugins/`),
  and `xrb-panel.json`; pinned `third_party/` assets use Git LFS. Ignored: `plugins/*/bin/`, `builds/`, `node_modules/`,
  `dist/`, `build/`, `jsconfig.json`. Never stage credentials, signing material, installed packages, compiled plugin
  binaries, runtime state or generated output.
- Read a plugin's own `CLAUDE.md` before changing it; run its documented focused tests.
- Apps get the SDK from the core's sources, never from a registry: the panel sets `XRB_CORE` for app scripts and
  in its own process; the app's Vite config aliases `@xr-build/sdk` / `@xr-build/ui-kit` to it and dedupes three.
  Workspace code (packagers too) reaches core modules only through `XRB_CORE`, never by a relative path.
- Plugins build against the core with the CMake variables the panel passes: `XRB_PLUGIN_SDK`, `XRB_THIRD_PARTY`
  (workspace), `XRB_CORE_THIRD_PARTY` (core), `XRB_PLUGIN_BIN_DIR` (the plugin's own `plugins/<p>/bin/`). Runs pass
  one `--plugin-dir=` per plugin `bin/`; packagers get `pluginDirs` (plugin name -> folder, from `--list-plugins`).

## Build and run (Windows, VS 2022 Build Tools)

```
pnpm fetch-deps                                   # once; the core's third_party/
pnpm fetch-deps:repo                              # refresh .xrbuild assets from external sources when available;
                                              # a Git LFS clone already has the pinned binaries
pnpm fetch-deps --workspace                       # user workspace plugins (XRB_HOME or home default)
cmake -S native/host -B native/host/build -G "Visual Studio 17 2022" -A x64
cmake --build native/host/build --config Release
native/host/build/Release/host-tests.exe          # unit tests
start.vbs                                         # user workspace control panel
start-repo.vbs                                    # this checkout's .xrbuild workspace
```

Tests: `node --test "test/**/*.test.ts"` in `packages/sdk`, `packages/ui-kit`, `packages/app-icon`,
`packages/control-panel` (Node runs the .ts directly; no TypeScript parameter properties, type stripping refuses
them); `node --test` in `tools/fetch-deps`, `tools/name-guard`, `tools/worktree`, `tools/pr-automation`,
`tools/repo-governance` and `tools/public-history` (`pnpm test` runs them all); `pnpm check:names`.

Use the CMake bundled with VS Build Tools
(`Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe`) if none is on PATH.
Host options use `--name=value` only (`--url=`, `--app-dir=`, `--display=`, `--input=`, `--platform=`,
`--plugin.<name>.<key>=<value>`, `--plugin-dir=`, `--display-fallback=desktop`, `--config=`, `--list-plugins`,
`--view=2d` (start a stereo display in 2D), `--camera-projection=perspective|orthographic`, `--record-hands=`, `--camera-view=on`, `--exit-after=`, `--icon=`,
`--render-icon=`, `--icon-size=`, `--status=stdout`). Without a role option the host reads `--config=`, else
`<exe>\xrb-app.json` (packages have one), else desktop + none, standalone. The panel runs a project with
`--config=` holding its manifest's `{ input, display, platform, plugins }`. Built-in provider keys:
`--plugin.replay.file=`, `loop`; plugin keys are in each plugin's docs in the workspace.
Logs: `%LOCALAPPDATA%\XRBuild\logs` (`xrb-host.log`).

## Hard-won facts (keep)

- Pages on https://app.local are a "public" origin to Chromium: its Local Network Access checks silently drop the
  WebSocket to the host channel on 127.0.0.1 unless those features are disabled (cef_client.h).
- Only one host at a time (named mutex); CEF cache and input devices cannot be shared.
- The host is built with CEF's flags (`_HAS_EXCEPTIONS=0`, no RTTI). When a third-party library built without them
  was linked into it, the two nlohmann/json copies mixed and crashed with 0xC0000409; the host still compiles
  nlohmann with `JSON_DIAGNOSTICS=1` (its own inline namespace) and reads JSON only through the non-throwing helpers
  in `json_util.h`. Third-party code lives in plugin DLLs, which never share C++ objects with the host.
- A GUI-subsystem exe is not waited for by PowerShell's `&`: run the host with `Start-Process -Wait -PassThru
  -RedirectStandardOutput` to get its exit code and stdout.
- The host ends with `TerminateProcess` after its own cleanup: GPU/ML runtime unloads in plugins can hang process exit.
- A station agent may run elevated, so the apps it launches run elevated; CEF needs `--do-not-de-elevate`, or it
  relaunches through Explorer (killed on kiosks) and `CefInitialize` fails. XR Build only makes packages; running
  them on a station uses the station's own scripts.
- Tools read the host through a stdout pipe: `--status=stdout` writes `@channel <url>` once and `@status {json}` every
  second (page fps, frame time, latency, eye size, hands, clients). Stop a host with `taskkill /PID` (no `/F`): that is
  `WM_CLOSE`, the display's clean exit. Never `TerminateProcess`/`/F` first: it skips the display plugin's end and can
  leave a 3D display in 3D. Anything that kills the host outright does the same (e.g. closing a station agent's
  console window).
- The host is a GUI exe and must never attach to a console: started by a console agent it shared the agent's
  console, so Ctrl+C there killed it before the display's exit and the panel stayed in 3D.
- When the same plugin name is found twice, the host keeps the first (`<exe>\plugins` before `--plugin-dir=`) and
  rejects the other: plugin folders left next to a host by an older build hid the workspace's. The panel marks the
  host outdated for them and Rebuild host removes them.
- App icon: one PNG per app (`icon.png` in the app's folder) is the package thumbnail (the packager decides its
  format) and the window icon (`app-icon.png` next to the exe, or `--icon=`); the built-in default is
  `native/host/src/app.ico` (`app-icon default-ico`). The app renders its own icon: `app-icon render --app <dist>
  --out <png>` runs `xrb-host --render-icon=` (hidden square view, `?xrb-icon=<size>`, transparent); the app shows
  only its subject and calls the SDK's `iconReady()`. The panel renders it when `icon.png` is missing (Render icon).
- `pnpm` on PATH needs corepack shims: `corepack enable pnpm --install-directory "$APPDATA/npm"` (no admin; plain
  `corepack enable` writes them into the Node install folder, which needs admin and a Node update deletes). The panel
  and `pnpm worktree` run `corepack pnpm` and work without them; scripts fall back to `node tools/<tool>/<tool>.mjs`.
- The dev rig GPU is an RTX 5090 Laptop; performance must be rechecked on an RTX 4070 station.
- After moving or renaming host or panel code, restart the control panel: a panel started earlier keeps its old code
  (it once launched a stale host exe that looked for a plugin's runtime in the wrong folder, error 126).
- After a host channel or SDK change, rebuild the apps (`dist/`): a bundle built with an older SDK may ignore
  messages it does not know (seen: no hand status until tracking ran).
- Windows file times move in ~16 ms ticks: a test that writes a file and checks its mtime changed must date it back first.
- Windows may hand out 8.3 short paths (`USERNA~1`) for the same folder as the long one: compare paths only after
  `realpathSync.native` (the name guard's hook does).
- Build target: a project's `target` is `host` (unset; xrb-host on a display with providers) or `webxr` (a standalone
  headset runs the app in its browser engine, no host, no providers). A packager declares `target` (default `host`);
  a `webxr` packager gets the web app, icon and identity only (`runtimeDir` "", no plugins). The headset's packager
  is a workspace plugin. Apps drive frames with `xrb.setAnimationLoop`: `requestAnimationFrame` stops in a session.
- 2D/3D while the app runs: the panel's 2D checkbox changes the managed mono camera over `kSetProjection`; on a
  display with a switchable session it also keeps the session and toggles physical mono/stereo over `kSetView`,
  confirmed with `kView`. `--camera-projection=orthographic` selects the initial camera and `--view=2d` starts a
  switchable display session in 2D.

## Commands for the user

- Whenever you give the user a command to run themselves (manual test, build, dev server, script, git step), give exactly one Git Bash line in one fenced code block, starting with `cd <absolute path of the repo or worktree> && ...`, so it can be pasted into any Git Bash window regardless of its current directory. Example: `cd /d/Git/xr-build/.worktrees/my-task && pnpm test`.
- Use Git Bash syntax only: forward-slash paths (`/d/Git/...`), `export VAR=value` or `VAR=value cmd`, `&&` between steps. Never PowerShell or cmd syntax, never several lines, never assume the user is already in the right folder.
