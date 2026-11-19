# Development

Runs three.js web apps on 3D displays with hand input, and packages them for station platforms. The **core**
(engine) is the host, plugin ABI, SDK, ui-kit and control panel. Displays, inputs, platforms and packagers are
providers behind abstract contracts; every concrete integration is a plugin. Reviewed public modules may live in the
core-owned `embedded/` workspace; generic engine code stays independent of concrete integrations. Authorized developers separately clone a
private development **workspace** at the ignored `.xrbuild/` path (see [Workspace](#workspace)). It owns its Git
history and documentation; read its `docs/` and each affected plugin's `DEVELOPMENT.md` before private edits. Ordinary users use `XRB_HOME`, else `%USERPROFILE%\.xrbuild`; explicit
repository-development commands or the separate XR Build Dev Start-menu shortcut select this checkout's `.xrbuild/`. The plan lives in OpenSpec (`openspec/specs/`, `openspec/changes/`).

Related: [Confidentiality](confidentiality.md) for what must stay out of this repository, and
[Private workspace](private-workspace.md) for the ignored `.xrbuild/` clone.

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
  Git/private/KEEP data and all user configuration/recordings. It never auto-removes stale locks.
  See `docs/embedded-extensions.md` for implemented contracts and remaining rollout work.
- `tools/fetch-deps` - native binaries with pinned SHA-256s: the core's into `third_party/`, the workspace
  plugins' (`--workspace`) into `<workspace>/third_party/`.
- `tools/name-guard` - the name guard (hashes in `banned.sha256`).
- `tools/worktree` - `pnpm worktree add|enter`: a task checkout in `.worktrees/` shares only the fetched core
  dependencies; its builds stay local to it. A private workspace is cloned into it independently, never linked.
  `pnpm task:repos` provisions such an independent private clone when a task needs one.
- `tools/pr-automation` - the `CI required` aggregate (`required.mjs`) and nightly triage.
- `.github/` - CI (`ci.yml`: ready PRs keep fast selected checks; full Windows host build/tests run nightly on
  `develop` or by explicit CI dispatch, not on PRs or `develop` pushes), nightly triage, and
  `delivery.yml`, which only forwards pull-request events and the bot credentials to the shared delivery workflow.
- `.xrbuild` - ignored independent private clone: projects, plugins and pinned Git LFS dependencies, with its own
  `.git` and LFS hooks; credentials, installed packages and generated builds stay ignored in that repository.
- `tools/add-to-start.vbs` - adds the ordinary "XR Build" user-workspace shortcut; `--repo` and `--user` can
  explicitly retarget that shortcut. `tools/add-dev-to-start.vbs` adds a separate "XR Build Dev" shortcut that
  invokes the stable checkout's `start-repo.vbs`. Install Start-menu shortcuts from a stable checkout, not a
  disposable task worktree; use the task worktree's repository launcher directly for task-specific development.

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
or within-test competing writers; `node --test` in `tools/fetch-deps`, `tools/name-guard`, `tools/worktree`, `tools/pr-automation`
and `tools/public-history` (`pnpm test` runs them all); `pnpm check:names`. The `tools/pr-automation` tests validate
generated OpenSpec changes with the shared workflow's pinned OpenSpec, read from `XRB_WORKFLOW_HOME` or `~/.workflow`.

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
