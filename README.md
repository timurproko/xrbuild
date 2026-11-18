<h1 align="center">XR Build</h1>

<p align="center">
  three.js web apps on 3D displays with hand input.
</p>

<p align="center">
  <img alt="Windows x64" src="https://img.shields.io/badge/windows-x64-2638d2?style=flat-square">
  <img alt="Node 22+" src="https://img.shields.io/badge/node-%E2%89%A522-2638d2?style=flat-square">
  <img alt="pnpm 9" src="https://img.shields.io/badge/pnpm-9-2638d2?style=flat-square">
  <img alt="CEF 151" src="https://img.shields.io/badge/CEF-151-2638d2?style=flat-square">
</p>

<p align="center">
  <a href="#requirements">Requirements</a> ·
  <a href="#workspace">Workspace</a> ·
  <a href="#plugins">Plugins</a> ·
  <a href="#dependencies">Dependencies</a> ·
  <a href="#build">Build</a> ·
  <a href="#run">Run</a> ·
  <a href="#package">Package</a> ·
  <a href="#develop">Develop</a> ·
  <a href="#troubleshooting">Troubleshooting</a>
</p>

## Requirements

Toolchain (dev machine):

- Windows 11 x64
- Node.js 22 or newer and pnpm 9: `corepack enable pnpm --install-directory "%APPDATA%\npm"` (no admin, survives
  Node updates; plain `corepack enable` needs an admin shell)
- Visual Studio 2022 Build Tools with the C++ workload (CMake ships with it, see [Build](#build))
- `gh`, authenticated, only for `pnpm preview:readme`

The panel's **Rebuild** action checks desktop prerequisites first and offers an explicit
[setup checklist with background progress](docs/desktop-setup.md). Browser-only use does not require the native
toolchain. Installation requires your consent and may show an administrator prompt; it never requests an automatic reboot.

**Settings → Apps (core) → Theme** offers System, Light and Dark, applied immediately and saved only in this browser. The **Dev shortcut** (or repository-development CLI) exposes **Design** in the app menu. Its [gallery](packages/control-panel/ui/DESIGN-SYSTEM.md#appearance-and-case-gallery) at `/design` collects shared components in Main and simulated workflow cases without installing anything; normal user launches do not show that menu entry.

The core runs without any device: the `desktop` display shows the page in a window and the `simulated`
or `replay` input stands in for hands. A 3D display, a hand tracker or a station platform comes from a
plugin, and each plugin lists the hardware and runtimes it needs.

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/separator-dark.svg"><img src="docs/assets/readme/separator.svg" alt="" width="280"></picture></p>

## Workspace

The core engine is the host, plugin ABI, SDK, ui-kit and control panel. Approved public projects/integrations live in the separate core-owned `embedded/` workspace; custom/private source stays in the selected user workspace. By default they share one **workspace** at `%USERPROFILE%\.xrbuild`, or the folder in `XRB_HOME`. `--projects=<path>` or `XRB_PROJECTS_HOME` can instead select a separate project repository while plugins, dependencies, package output, and runtime state remain in the integration workspace.

Authorized developers clone the independent private `.xrbuild` repository at `<checkout>/.xrbuild/`. Core ignores the whole folder, including its own `.git`; it is not a submodule or symlink. Ordinary users need neither private access nor Git LFS for the core. The separate public [`timurproko/xrbuild.dev`](https://github.com/timurproko/xrbuild.dev) repository receives only selected built app output for the site. Explicit repository-development commands or the **XR Build Dev** shortcut select the private workspace. See [migration and recovery](docs/workspace-split.md); detaching current files does not sanitize old Git history, and licensing/public release remain separate gates.

```text
<workspace>/
  projects/<section>/<name>/    projects: a folder with an xrb-project.json, in a section folder
  projects/unsorted/<name>/     projects in no section (and new ones)
  projects/archive/<name>/      archived projects
  plugins/<name>/               plugins: a native CMake project and/or a packager package; built files in bin/
  xrb-panel.json                the panel's project list layout
  third_party/, builds/         pinned plugin dependencies (LFS in .xrbuild), build output (ignored)
```

A combined workspace or separate project repository keeps its own `package.json` and `pnpm-workspace.yaml`; neither is part of the core pnpm workspace. Projects may live in the private workspace or in a separately selected project repository, but are not duplicated between them.
Source, manifests and lock files are versioned by their owning repository. The private workspace tracks pinned `third_party/`
dependencies through its own Git LFS configuration, while ordinary user workspaces and core dependencies do not. `node_modules/`,
plugin `bin/`, builds, credentials and generated output stay ignored. A missing or empty user workspace opens normally, with no setup dialog
or automatic starter app. Confirming "New project" creates the missing workspace files and only the requested app from
[`templates/app`](templates/app); explicit settings/build actions create their needed user storage lazily. Apps get the SDK straight from
this repo's sources: the panel sets `XRB_CORE` and the app's Vite config maps `@xr-build/sdk` and
`@xr-build/ui-kit` to it ([SDK](packages/sdk/README.md#getting-the-sdk-into-an-app)).

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/separator-dark.svg"><img src="docs/assets/readme/separator.svg" alt="" width="280"></picture></p>

## Plugins

The core talks to providers for three roles, display, input and platform, and to packagers; it names no
device, tracker or platform. Built-in providers: display `desktop`; inputs `none`, `replay`, `simulated`.
Everything else is a plugin in the selected workspace's or product `embedded/` workspace's `plugins/`:

- **Native part:** a DLL built against the C ABI in
  [`native/plugin-sdk/include/xrb_plugin.h`](native/plugin-sdk/include/xrb_plugin.h). The panel configures
  each plugin's CMake project with `XRB_PLUGIN_SDK` (this repo's plugin SDK), `XRB_THIRD_PARTY` (the
  workspace's binaries), `XRB_CORE_THIRD_PARTY` (this repo's, e.g. nlohmann/json) and
  `XRB_PLUGIN_BIN_DIR` (the plugin's own `bin/`), where the plugin installs its files. The host gets each
  plugin's `bin/` with a `--plugin-dir=`.
- **Packager:** a package whose `package.json` names a module in `xrBuild.packager`, implementing the
  contract in [`packages/control-panel/src/packagers.ts`](packages/control-panel/src/packagers.ts).
- **Settings:** `--plugin.<name>.<key>=<value>`, or the project's `plugins.<name>` section.

A project picks its providers in its `xrb-project.json` (`display`, `input`, `platform`); a package
records them in `xrb-app.json` next to the exe.

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/separator-dark.svg"><img src="docs/assets/readme/separator.svg" alt="" width="280"></picture></p>

## Dependencies

Core native binaries live in the ignored `third_party/` folder. `pnpm fetch-deps` fills it
and checks every file against a pinned SHA-256. The core needs only two public downloads
([`tools/fetch-deps/sources.mjs`](tools/fetch-deps/sources.mjs), pinned in
[`tools/fetch-deps/deps.lock.json`](tools/fetch-deps/deps.lock.json)):

| Folder | What | Source |
|---|---|---|
| `cef/` | CEF 151 (Chromium 151) minimal, Windows x64 | cef-builds.spotifycdn.com |
| `nlohmann/` | nlohmann/json 3.12.0 | GitHub release |

```text
pnpm fetch-deps
```

A workspace plugin lists its own binaries in `plugins/<plugin>/deps.json`, pinned in the `deps.lock.json`
next to it; they go into the workspace's `third_party/`. In this repository's private `.xrbuild/`, the pinned
files are committed in the private repository through Git LFS, so install Git LFS before cloning that repository to materialize them without those external
source checkouts. Other workspaces still fetch dependencies normally. A plugin's paths use variables (`${NAME}`); the
environment variable `XRB_<NAME>` overrides one, `XRB_GIT_ROOT` the common root (default `D:/Git`).

```text
pnpm fetch-deps --workspace
pnpm fetch-deps --workspace --plugins=<plugin>,<plugin>
pnpm fetch-deps:repo                         # refresh LFS-pinned .xrbuild files from external sources when available
```

Fetch only some sources (ids matched by prefix), or re-pin after a deliberate upgrade (and commit the lock):

```text
pnpm fetch-deps --only cef,nlohmann
pnpm fetch-deps --update-lock
```

JS dependencies (three.js, Vite, lucide, ...) come from the package registry through pnpm: `pnpm install`
here (`packages/*`, `tools/*`), and in the workspace (the panel runs it there when needed).
The core-owned `embedded/` package workspace stays separate. Root `setup:embedded`, `build:embedded` and `test:embedded`
scripts take an explicit writable `--workspace` and install/build/test fresh snapshots without changing product sources.
Root tests include that public lane; private packages are never enrolled. Bundled modules include consolidated
WebXR publisher in `embedded/plugins/publisher-webxr/` and the authored hand implementation/diagnostic in
`embedded/plugins/input-hands/`, plus the explicitly configured launcher packager in `embedded/plugins/platform-headset/`.
Eight product project groups under `embedded/projects/` include the launcher, UI showcase, starter and archived diagnostics.
Their defaults are desktop/no input, without publication/signing/machine identity. Rebuild uses user cache; editing needs Copy to workspace.
Publisher has local and explicitly configured production destinations. Optional headset tools and existing signing keys are user-provisioned, never global discoveries or automatic downloads.
User configuration, certificates, history, hand calibration/preferences and recordings stay in the selected workspace.
Hand defaults are synthetic; optional models/device runtimes are not shipped or implicitly downloaded/started.
`check:types` validates public production TypeScript with an exact pinned strict no-emit toolchain; `test` runs it first.
Private and embedded package workspaces stay independently installed and are not enrolled by this check.
`setup:services` explicitly activates isolated public service dependencies/builds; discovery never installs them.
All panel packagers receive checked runtime/app/selected-plugin snapshots. Bundled advanced run options bind actual
provider schemas, and reviewed cleanup only reclaims obsolete owned working generations, not published runtimes or user data.
`task:repos` supports owner routing and ignored tested-revision handoffs without staging/exporting/pushing source.
See [embedded extension contracts](docs/embedded-extensions.md) for commands, component references and remaining distribution acceptance.

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/separator-dark.svg"><img src="docs/assets/readme/separator.svg" alt="" width="280"></picture></p>

## Build

The control panel rebuilds `xrb-host.exe` and the workspace plugins itself when their sources are newer
than their builds ("Rebuild host"). By hand:

```text
cmake -S native/host -B native/host/build -G "Visual Studio 17 2022" -A x64
cmake --build native/host/build --config Release
```

No `cmake` on PATH? Use the one in VS Build Tools:
`Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe`.

A workspace plugin by hand (from the workspace, with `XRB_CORE` set to this repo), the same paths the panel
passes:

```text
cmake -S plugins/<p> -B plugins/<p>/build -G "Visual Studio 17 2022" -A x64 -DXRB_PLUGIN_SDK=%XRB_CORE%/native/plugin-sdk -DXRB_THIRD_PARTY=third_party -DXRB_CORE_THIRD_PARTY=%XRB_CORE%/third_party -DXRB_PLUGIN_BIN_DIR=plugins/<p>/bin
cmake --build plugins/<p>/build --config Release
```

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/separator-dark.svg"><img src="docs/assets/readme/separator.svg" alt="" width="280"></picture></p>

## Run

Start the control panel (no console window; a second start only opens the running panel):

```text
start.vbs
```

If core app dependencies are missing after a pull, the shortcut shows a Rebuild-style setup modal with live logs,
installs the pinned public dependencies with a frozen lock and lifecycle hooks disabled, then opens the requested panel
automatically. Errors stay visible with Retry and Copy log. Healthy starts skip installation; private/native setup is not
part of this repair. See [Shortcut startup](docs/shortcut-startup.md) for prerequisites, logs and recovery.

Or from a terminal (normal CLI diagnostics, without GUI bootstrap):

```text
pnpm panel
```

Those user-mode entry points resolve `XRB_HOME`, else `%USERPROFILE%\.xrbuild`. For private repository
development, `start-repo.vbs` or `pnpm panel:repo` explicitly selects the current checkout's `.xrbuild/`,
even when `XRB_HOME` points elsewhere. No separate project checkout is needed for the repository's local apps. An optional `--projects=<path>` (or `XRB_PROJECTS_HOME`) selects another project root; without it, projects remain in the selected workspace. User mode defaults to `http://127.0.0.1:5180`; explicit workspace
launches, including repository mode, default to `http://127.0.0.1:5181`. The two panels can run together.
`XRB_PANEL_PORT` overrides either default for that invocation. If another checkout already owns 5181, the
launcher refuses to open its different workspace; set a different `XRB_PANEL_PORT` for the new launch.

The panel lists the selected project root's projects while loading plugins and generated state from the integration workspace. It builds projects, runs them with their providers and live status, switches a 3D display between 2D
and 3D, shows the input provider's camera view and renders app icons.

Add the ordinary **XR Build** shortcut to the Start menu:

```text
tools/add-to-start.vbs
```

It opens user mode on 5180 and selects `XRB_HOME`, else `%USERPROFILE%\.xrbuild`. A missing or empty workspace shows
the normal setup screen; the shortcut does not create, move or delete either directory or stop an already-running
panel. The old `%USERPROFILE%\.xr-build` workspace is not migrated; set `XRB_HOME` to its path to keep using it.

Add a separate **XR Build Dev** shortcut for this checkout's independently cloned `.xrbuild/` workspace:

```text
tools/add-dev-to-start.vbs
```

It invokes `start-repo.vbs`, explicitly selects `<checkout>/.xrbuild/` and normally uses port 5181, so the ordinary
and development panels can run together. A port serving another workspace is refused, not opened.
`XRB_PANEL_PORT` can override either port for that invocation.

Both shortcut installers store absolute checkout paths: install them from the stable primary checkout after
merging, not a disposable worktree, and rerun them after moving the repository. For worktree-specific development,
run that worktree's `start-repo.vbs` or `pnpm panel:repo` directly. The existing `--repo` and `--user` options on
`add-to-start.vbs` remain available when one shortcut name must be retargeted explicitly.

Run the host directly in a window, with no device (options are `--name=value` only):

```text
native/host/build/Release/xrb-host.exe --app-dir=<built app folder> --display=desktop --input=simulated
```

List the built-in providers and the plugins the host finds (plus the workspace's):

```text
native/host/build/Release/xrb-host.exe --list-plugins --plugin-dir=%USERPROFILE%\.xrbuild\plugins\<p>\bin
```

Common host options: `--url=`, `--app-dir=`, `--display=`, `--input=`, `--platform=`, `--plugin-dir=`,
`--plugin.<name>.<key>=<value>`, `--view=2d`, `--camera-projection=perspective|orthographic`, `--record-hands=`, `--camera-view=on`, `--exit-after=`, `--icon=`,
`--status=stdout`. Without a role option the host reads `--config=<file>` (the panel passes the project's
providers and plugin settings), else `<exe>\xrb-app.json` (a package has one), else it starts with the
desktop display and no input. Stop a running host with `taskkill /PID <pid>` (never `/F`: it skips the
providers' cleanup, and a 3D display may stay in 3D).

Logs: `%LOCALAPPDATA%\XRBuild\logs`.

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/separator-dark.svg"><img src="docs/assets/readme/separator.svg" alt="" width="280"></picture></p>

## Package

Build a package from the panel (Build package). Desktop uses the built-in portable Windows packager;
other targets use the packager of the project's platform plugin. A host package holds the built app,
`xrb-host.exe`, the selected plugins (from their `bin/`) and `xrb-app.json` with the providers and settings
it starts with. Extract a Desktop package and run `xrb-host.exe`. Packages land in a channel-specific workspace folder such as `builds/desktop/`, `builds/cx/`, or `builds/quest/`; the Build-card folder action opens the selected channel.

Render an app's icon (`icon.png` in the app's folder) with the app itself:

```text
node packages/app-icon/src/cli.ts render --app <built app folder> --out <app folder>/icon.png
```

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/separator-dark.svg"><img src="docs/assets/readme/separator.svg" alt="" width="280"></picture></p>

## Develop

Layout:

| Path | What |
|---|---|
| `native/host` | `xrb-host.exe`: CEF off-screen browser → frame on the display; providers for display, input and platform; host channel WebSocket to the page |
| `native/plugin-sdk` | `xrb_plugin.h`: the C ABI between the host and its plugins |
| [`packages/sdk`](packages/sdk/README.md) | `@xr-build/sdk`: stereo rig, hand input, pointer emulation for three.js |
| [`packages/ui-kit`](packages/ui-kit/README.md) | `@xr-build/ui-kit`: 3D controls on the hand interaction core |
| `packages/app-icon` | `@xr-build/app-icon`: default app icon, `.ico`, rendering an app's own icon |
| `packages/control-panel` | `@xr-build/control-panel`: the control panel (Node server + browser UI) |
| `packages/desktop-package` | `@xr-build/desktop-package`: built-in portable Windows package |
| `templates/` | the new workspace and the new app the panel creates |
| `tools/` | `fetch-deps`, `name-guard`, `worktree`, `pr-automation`, `repo-governance`, `preview-readme`, Start-menu installers |
| `config/` | `github-repository-governance.json`: repository settings as code |
| `.github/` | CI, the bot workflows, the PR template |
| `openspec/` | the plan: specs and changes |
| `.xrbuild/` | ignored independent private workspace clone; owns projects, plugins and LFS assets separately from core |

Tests:

```text
native/host/build/Release/host-tests.exe
pnpm test
```

Keep core paths and files neutral: no vendor, product, client or person names outside `.xrbuild/` (the rule in
`.claude/CLAUDE.md` and `openspec/config.yaml`). The entire private `.xrbuild/` subtree is exempt, including
project samples, plugins and pinned LFS binaries; exclude it from any future public export. `pnpm check:names`
enforces the core boundary. The banned names exist
only as hashes (`tools/name-guard/banned.sha256`), never as a plain list. `pnpm names add <name>` bans one more
(`--exact` for a name whose lower-case form is an ordinary word); commit the changed hash file. Enable the
pre-commit check once per clone:

```text
pnpm hooks
```

Preview the README as GitHub renders it, in your browser (needs `gh`):

```text
pnpm preview:readme
```

### Changes and pull requests

`main` takes changes only through a squash-merged PR that passes the `CI required` check. Each task works in its own
worktree. The helper shares only untracked core `third_party/` entries. For private integration work, provision an
independent `.xrbuild/` clone in that task worktree; never junction the primary workspace into it. Private source,
plugin builds, app output and packages stay task-local. Cleanup refuses any `.xrbuild/` or `.artifacts/KEEP` marker;
preserve those files separately before cleanup (sweep reports protected worktrees as dirty):

```text
pnpm worktree add fix/hand-jitter      # .worktrees/hand-jitter on a new branch from origin/main
pnpm worktree sweep                    # every task worktree: dirty / active / merged / closed / unknown
pnpm worktree sweep --apply            # remove the merged, clean ones
pnpm worktree remove hand-jitter       # remove one after its merge (--discard if its PR was closed unmerged)
```

A change that needs a plan starts as a draft PR holding only its OpenSpec change, linked in the PR body's Automation
block; the code follows in the same PR once the plan is approved. Complete Implementation outcomes and their detailed
pre-ready tasks truthfully; trusted automation, not the agent, marks an unchanged eligible draft ready. Missing bot
configuration or unfinished task records remain visible blockers. Once ready, the repo bot archives
the change in the PR (specs synced), and CI's `Delivery` job turns green. The existing narrow documentation-only
auto-merge policy remains available only when explicitly enabled; the reviewed delivery activation profile leaves that
auxiliary workflow disabled. Implementation PRs remain maintainer-merged. Ready PRs keep the name guard, OpenSpec,
delivery and relevant Node/workspace checks, but **do not build or test the native host**, even when host code changes.
A skipped host check is not a successful native build. Pushes to `main` also omit that several-minute lane. The full
Windows host build and native tests run on the scheduled nightly CI for `main`, or when CI is manually dispatched
from Actions for a chosen ref before merging a sensitive change. A nightly failure opens a draft `fix/nightly-<date>`
PR; it cannot retroactively block an earlier merge. The full process for agents is
`.claude/skills/change-delivery/SKILL.md`.

Repository settings, the `main` ruleset and the workflow labels are declared in
`config/github-repository-governance.json`. No administrator or bot bypass is declared. The maintainer checks them
locally with their own `gh` login; change them in a PR, then review capability preflight and explicitly scoped activation:

```text
pnpm governance preflight
pnpm governance protect --confirm apply-xr-build-governance
pnpm governance activate-ci --confirm apply-xr-build-governance
```

See [protected PR delivery](docs/pr-delivery-governance.md) for full bot activation, bootstrap, blocked private-account
capabilities and exact-head canary acceptance. Partial CI-only activation does not certify automatic readiness.

**Repo bot.** Install a repository-scoped GitHub App with Contents and Pull requests (read/write), Metadata (read),
and only additional read permissions required by enabled probes; no webhook is needed. Its id is
the Actions variable `XRB_BOT_APP_ID` and a private key the secret `XRB_BOT_PRIVATE_KEY`; the `Bot probe` workflow
checks both. To rotate the key, generate a new one on the App's page, replace the secret, and delete the old key.

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/separator-dark.svg"><img src="docs/assets/readme/separator.svg" alt="" width="280"></picture></p>

## Troubleshooting

- **No projects in the panel** — check `--projects` or `XRB_PROJECTS_HOME`; without either, projects come from the selected `XRB_HOME`/repository workspace. Both resolved roots are shown in the top bar.
- **An app build stops with "XRB_CORE is not set"** — build it from the panel, or set `XRB_CORE` to this repo.
- **`fetch-deps`: source not found** — a plugin's local source is missing or elsewhere; set its `XRB_*` path.
- **`fetch-deps`: SHA-256 mismatch** — the local source is on a different version than the lock.
  Check out the pinned version, or re-pin with `--update-lock` if the upgrade is intended.
- **A provider is missing in the panel or `--list-plugins`** — Rebuild host; `--list-plugins` also
  reports plugin DLLs it rejected and why.
- **Display stays in 3D after a crash** — a host was killed with `/F`; start and close a host
  cleanly once.
- **Only one host at a time** — a second host exits; close the first one.

<br>

<p align="center">
  <picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/waves-dark.svg"><img src="docs/assets/readme/waves.svg" alt="" width="100%"></picture>
</p>
