# XR Build

Runs three.js web apps on 3D displays with hand input, and packages them for station platforms. The **core**
(engine) is the host, plugin ABI, SDK, ui-kit and control panel. Displays, inputs, platforms and packagers are
providers behind abstract contracts; every concrete integration is a plugin. Reviewed public modules may live in the
core-owned `embedded/` workspace; generic engine code stays independent of concrete integrations. Authorized developers separately clone a
private development **workspace** at the ignored `.xrbuild/` path (see [Workspace](#workspace)). It owns its Git
history and instructions; read its `CLAUDE.md` and each affected plugin's instructions before private edits. Ordinary users use `XRB_HOME`, else `%USERPROFILE%\.xrbuild`; explicit
repository-development commands or the separate XR Build Dev Start-menu shortcut select this checkout's `.xrbuild/`. The plan lives in OpenSpec (`openspec/specs/`, `openspec/changes/`).

@../AGENTS.md

## Git

- Never add a `Co-Authored-By: Claude` (or any Claude/Anthropic) trailer to commit messages,
  and no "Generated with Claude Code" lines in commits or PR descriptions.
- Commit only when asked.
- Keep commit messages concise: a short subject line, then a few bullets only if needed.
- Tick tasks and PR outcomes as the `Implementation progress` paragraph of `AGENTS.md` (imported above) says.
  Add plain Acceptance before the final item and leave post-ready CI/integration pending until observed.
  Only trusted automation promotes completed exact snapshots; do not invoke ready or mark unfinished tasks done.
  Run focused changed-code checks rather than broad repeated validation loops before pushing.

## Changes and pull requests

- Every change follows the `change-delivery` skill (`.claude/skills/change-delivery/SKILL.md`): own worktree and
  branch, plan first as a draft PR, implementation after the maintainer approves, OpenSpec finalization in the PR by
  the repo bot, handoff, cleanup. Agents never merge, arm auto-merge or push to `main`; the maintainer merges.
- Missing canonical contracts after an accepted public bootstrap may use an explicitly approved contract-only
  checkpoint under `docs/spec-baseline-reconciliation.md`. Preserve historical plans/tasks and recorded contract
  order; only the normal bot synchronizes/archives the completed checkpoint. A successor stays blocked until
  the checkpoint is bot-finalized and maintainer-merged. This grants no export, hosting, cleanup or merge authority.
- Commits and PR titles: `type(scope): subject` (scope: `host`, `plugin-sdk`, `sdk`, `ui-kit`, `app-icon`,
  `panel`, `templates`, `fetch-deps`, `name-guard`, `openspec`, `ci`, `claude`, ...). The PR title becomes the
  squash commit on `main`.
- Core changes reach `main` only through a PR: the `protect-main` ruleset (squash only, required check "CI required")
  and the other repository settings are declared in `config/github-repository-governance.json`; change them there and
  inspect `pnpm governance preflight`, then apply an explicitly approved `protect`, `activate-ci` or `activate` mode
  with `--confirm apply-xr-build-governance`. No administrator/bot bypass is allowed. Unsupported account protection
  and missing bot setup are owner prerequisites, never reasons to change visibility, billing or required checks.
  See `docs/pr-delivery-governance.md`; repository policy files alone do not certify live activation.
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
- A concrete integration belongs in the selected workspace (`.xrbuild/plugins/<name>` for repository development)
  or, after an explicit public export audit/approval, in `embedded/plugins/<name>`. Never put concrete integration
  branches in the generic engine. Core features reach plugins only through the C ABI (`native/plugin-sdk/include/xrb_plugin.h`), the host channel
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
  selected plugins). User mode: `start.vbs` or `pnpm panel`; repository mode: `start-repo.vbs` or `pnpm panel:repo`.
- `templates/workspace`, `templates/app` - what the panel creates: a new workspace, a new app.
- `embedded/` - core-owned product workspace for approved public plugins/projects; no independent `.git`.
  Same root-relative manifests and `plugins/`, `projects/<section>/<id>/`, `docs/`, `third_party/` structure as a user
  workspace. Product sources/defaults are read-only in ordinary panel use; user config belongs in
  `<selected-workspace>/config/plugins/<id>/`. Developer public dependency fetches use core `third_party/`; explicit
  desktop setup can provision checked user-owned core native dependencies without changing product sources.
  Embedded project IDs are origin-qualified and retain stable logical identity through organization changes. Embedded
  apps use the normal compact Develop/Publish/Build UI and support ordinary settings/name/icon edits, development,
  runs, packaging, publication, mixed sections/order and archive/unarchive; only deletion is forbidden by origin.
  Installed sources stay immutable. Explicit writable actions prepare durable editable public inputs in the selected
  project repository's `.xrb/embedded-projects/<scope>/w-<id>/workspace/`; no separate Copy step or catalog duplicate.
  Working sources/settings/deployment identity survive rebuild/restart and stay outside disposable caches. Logical
  embedded placement in `xrb-panel.json` never moves product folders. Operation locks in `.xrb/embedded-locks/`
  protect builds/settings/organization and remain leased for active runs. Explicit source-consuming actions automatically
  refresh changed installed inputs through baseline-aware atomic working generations, retaining compatible source edits,
  personal settings/identity/icons/recordings and all previous generations. Legacy state upgrades keep its complete old
  tree recoverable. Genuine conflicts/unsafe state block the action without stale-source fallback; normal Apps cards have
  no routine source-review banner/button. Generation-pinned output survives refresh, while new consumers require current output.
  Valid unmaterialized packaged preview/run stays read-only. Optional independent copies reset deployment/device identity.
  Launch config/default icons use integration-workspace `build/project-state/`; effective recordings use writable sources.
  Legacy personal `config/projects/<key>/run.json` choices remain scoped/revision-checked and import once into effective
  settings; malformed/linked/schema-mismatched records block preparation without replacement. Normal settings then
  take precedence. Managed public dependencies retain pinned/frozen isolated installation, prerequisite ordering and
  checked immutable finalized output under integration-workspace `build/projects/<key>/`, without product writes. Cached
  preview/native runs share validated output; stale/failed/foreign state blocks automatic fallback. Browser routes pin
  generations. No user/private workspace packages or ambient repository/package-manager configuration is inherited;
  build code is trusted, not sandboxed. `setup:embedded`, `build:embedded` and `test:embedded` use explicit writable
  workspaces and fresh `build/embedded/e-<core-key>/` snapshots. Local package graphs and frozen lockfile links must
  agree; prerequisite builds precede tests/project builds. Root test and public Node CI invoke this lane explicitly.
  Approved embedded modules include consolidated Publisher, the authored hand implementation/diagnostic with its
  plugin-owned nested sample package (`plugins/*/samples/*`), and the explicitly configured headset packager.
  Seven public project groups preserve core/archive sections with desktop/no-input defaults and no deployment identity. The duplicate embedded starter is retired; New project still uses the canonical core template with its 3D icon/theme and required notices. Existing user projects and retained embedded working state are never deleted by product retirement.
  Headset tools/signing are explicitly provisioned user state, never global discovery/downloads or bundled binary payloads.
  Hand source/build descriptors use public reviewed dependencies, user-owned state and synthetic default validation;
  unverified model/device payloads remain external and never start/download implicitly. Publisher local/production
  service IDs remain stable, production defaults disabled/unconfigured, and persistent local history lives outside build
  caches in user `.xrb/publication/publisher-webxr/local`. Validation snapshots are not activated runtimes or distributable packages.
  Plugins source selection is available in the UI with revision-checked, locked preference updates and paired idle
  publisher/packager refresh. Out-of-band catalog/preferences/runtime changes refresh coherently when idle; new actions
  recheck state, busy refresh blocks new consumers, and changed already-executed module/dependency code or tool identity
  requires actual restart. Declared exports/references resolve #aliases through selected origin-qualified owners.
  Desktop packages stage fixed host/CEF inventories and selected DLL/license files; additional plugin assets require
  a bounded xrb-runtime.json allowlist. Source/credential/link escapes and existing-folder/version replacement are refused.
  All panel adapters receive neutral checked input snapshots. Explicit setup:services activates isolated public dependency/
  build snapshots with locked source-bound receipts; discovery never installs private/user packages or writes product source.
  Operational content checks are not export/license approval; actual promoted-module/distribution acceptance remains open.
  Reviewed cache cleanup removes only owned obsolete working generations, preserving reserved/published/current/unknown/
  Git/private/KEEP data and all user configuration/recordings. It never cleans a worktree or auto-removes stale locks.
  See `docs/embedded-extensions.md` for implemented contracts and remaining rollout work.
- `tools/fetch-deps` - native binaries with pinned SHA-256s: the core's into `third_party/`, the workspace
  plugins' (`--workspace`) into `<workspace>/third_party/`.
- `tools/name-guard` - the name guard (hashes in `banned.sha256`).
- `tools/worktree` - `pnpm worktree add|enter|remove|sweep|handoff`: task worktrees in `.worktrees/` share only
  fetched core dependencies. Private workspaces must be cloned independently; builds stay worktree-local.
  Cleanup refuses `.xrbuild/` or `.artifacts/KEEP`, even with clean outer Git status; sweep preserves them as dirty.
  `pnpm task:repos` routes core/embedded/private/paired tasks, explicitly provisions independent private clones only when
  needed, and records exact tested HEAD/work state in ignored artifacts. No implicit export/stage/PR/push/merge/cleanup;
  private instructions still apply. Follow the shared Worktrees guidance in `AGENTS.md`; do not add another linkage gate.
  Spec prerequisites are recorded in the active change.
- `tools/pr-automation` - the PR body link (`pr-body.mjs`), delivery check, OpenSpec finalization, guarded ready-PR
  branch refresh after main merges, docs auto-merge, unarchived-change report and nightly triage that the workflows run.
- `tools/repo-governance` + `config/github-repository-governance.json` - repository settings as code (`pnpm governance`).
- `.github/` - CI (`ci.yml`: ready PRs keep fast selected checks; full Windows host build/tests run nightly on
  `main` or by explicit CI dispatch, not on PRs or `main` pushes), the bot workflows (OpenSpec finalization and
  reconcile, ready-PR refresh, docs auto-merge, nightly triage, bot probe; scoped App token for refresh, `actions/app-token`
  for other bots), PR template. Refresh updates only stale ready same-repository PRs with expected-head guards, emitting
  ordinary CI events without merging PRs; drafts/forks are skipped and conflicts need manual resolution. See
  `docs/pr-delivery-governance.md` for activation and stalled-run limits.
- `.xrbuild` - ignored independent private clone: projects, plugins and pinned Git LFS dependencies, with its own
  `.git` and LFS hooks; credentials, installed packages and generated builds stay ignored in that repository.
- `tools/add-to-start.vbs` - adds the ordinary "XR Build" user-workspace shortcut; `--repo` and `--user` can
  explicitly retarget that shortcut. `tools/add-dev-to-start.vbs` adds a separate "XR Build Dev" shortcut that
  invokes the stable checkout's `start-repo.vbs`. Install Start-menu shortcuts from a stable checkout, not a
  disposable task worktree; use the task worktree's repository launcher directly for task-specific development.

## Workspace

- `.xrbuild/` is an independent private Git clone physically inside the checkout but ignored as a whole by core.
  It keeps its own `.git`, `package.json`, `pnpm-workspace.yaml` and LFS attributes/hooks. Never stage the clone,
  its Git metadata/private history or private binaries in core Git, and never enroll private packages in the core
  pnpm workspace. Public promotion is a separately approved, audited source snapshot, not a copy of the clone or
  a history merge. It is not a submodule or symlink.
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
  `projects/unsorted/` for none, `projects/archive/<name>` archived; folder names unique), `plugins/<name>`,
  plugin-owned originals under `plugins/<name>/samples/<sample>` (imported editable copies go to `projects/plugins/`),
  and `xrb-panel.json`; pinned `third_party/` assets use Git LFS. Ignored: `plugins/*/bin/`, `builds/`, `node_modules/`,
  `dist/`, `build/`, `jsconfig.json`. Never stage credentials, signing material, installed packages, compiled plugin
  binaries, runtime state or generated output.
- Read a plugin's own `CLAUDE.md` before changing it; run its documented focused tests.
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

Public production TypeScript is checked with `pnpm check:types` (exact pinned compiler/type packages, strict no-emit,
Node-compatible erasable syntax). Root `pnpm test` runs it before suites; private/embedded package workspaces remain separate.
Public embedded/contracts/dependency changes select the Windows frozen/types/compiler boundary lane; full managed host
and selected bundled native rebuilds keep the nightly/manual lane. Never describe disabled remote Actions as acceptance.

Tests: `node --test "test/**/*.test.ts"` in `packages/sdk`, `packages/ui-kit`, `packages/app-icon`,
`packages/control-panel` (Node runs the .ts directly; no TypeScript parameter properties, type stripping refuses
them). The control-panel package's `pnpm test` bounds file parallelism to two workers without changing test deadlines
or within-test competing writers; `node --test` in `tools/fetch-deps`, `tools/name-guard`, `tools/worktree`, `tools/pr-automation`,
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
  host outdated for them. Managed Rebuild host leaves product-side files untouched and selects a clean user-cached
  runtime; cached legacy plugin folders are preserved outside the published runtime.
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
