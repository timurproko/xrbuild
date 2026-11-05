# Proposal

## Why

The repo mixes the engine (host, plugin ABI, SDK, panel) with the user's own material: projects, prototypes and
plugins built on third-party SDKs. That blocks publishing the engine: vendor and client names reach the docs, specs,
manifests and history, and a rule in `CLAUDE.md` alone cannot keep them out. Splitting the user's material into a
workspace of its own lets the core be published as a clean public repo, while projects and plugins live in a private
repo the user controls.

## What Changes

- **User workspace.** Projects, plugins and the panel layout move to a workspace folder
  in the user's home, `%USERPROFILE%\.xr-build` (override: `XRB_HOME`). The workspace is an ordinary folder the user
  keeps in its own git repo; the core never commits to it. The panel creates an empty workspace on first start.
- **Panel reads the workspace.** Project discovery, archive, layout (`xrb-panel.json`), packager discovery, the host
  freshness check and the host rebuild work on the workspace instead of the repo. Projects live in one `projects/` folder:
  the panel's sections are its subfolders (`projects/Unsorted/` for none), archived projects are in `projects/archive/`.
  **BREAKING** for anyone keeping projects in the core repo: they must move to the workspace.
- **Plugins outside the host folder.** Workspace plugins build against the core's plugin SDK (path given by the panel)
  and install into their own `bin/` folder; the panel starts the host with a `--plugin-dir=` for each. Packages still carry the selected plugins next to the packaged exe.
- **Plugin dependencies.** `fetch-deps --workspace` collects each workspace plugin's `deps.json` into the workspace's
  ignored `third_party/`; the core's own dependencies stay in the core.
- **SDK without a package registry.** Apps import `@xr-build/sdk` and `@xr-build/ui-kit` as today, but no longer list
  them as dependencies: the panel sets `XRB_CORE` when it runs an app script and the app's Vite config aliases both
  names to the core's sources. The new-project template carries that config; an editor `jsconfig.json` is generated.
- **Name guard.** `check:vendor-free` becomes a guard over the whole core repo (contents, file names, package names)
  against banned names stored only as hashes (no plain list anywhere); the rule itself is in `CLAUDE.md` and the
  OpenSpec config. It runs in CI, as a git
  pre-commit hook and as a Claude Code hook on file edits. The `vendor-names-begin/end` exception is removed.
- **Neutral core.** Old-name readers and deprecated aliases are removed (**BREAKING**: old manifest, layout,
  environment and ProgramData names are no longer read by the core; the workspace migration converts them once).
  Docs, `CLAUDE.md` and OpenSpec describe plugin roles, not plugins. The in-flight OpenSpec changes move to the
  workspace with their history; the core gets neutral canonical specs.
- **Migration and republish.** A one-time migration extracts `plugins/`, `apps/`, `tests/`, `archive/` and the
  in-flight changes, with history, into the workspace repo. The cleaned core is verified by the guard and a full
  exposure scan, then published as a new public repo with a fresh history; the current repo stays private.

## Capabilities

### New Capabilities
- `user-workspace`: where the user's projects, plugins and layout live, how the panel and tools find and create the
  workspace, and how workspace plugins are built, fetched and loaded by the host.
- `app-sdk-supply`: how apps outside the core get the SDK and ui-kit at build, dev and edit time without a package
  registry.
- `name-guard`: the core repo contains no banned names, enforced from a hashed list in CI, before commits and on
  agent edits.

### Modified Capabilities
None in `openspec/specs/` (it is empty: no change is archived yet). The in-flight changes define requirements this
change supersedes: `dev-control-panel` (Project convention, Project list, Host freshness check: repo root becomes the
workspace), `plugin-host` (Vendor-free core: the `plugins/` exception goes away; Plugin discovery: the workspace
folder is added) and `platform-provider` (Packager contract: packagers are found in the workspace). The neutral
canonical specs written by this change carry the updated wording.

## Impact

- `packages/control-panel`: `projects.ts`, `layout.ts`, `panel.ts`, `packagers.ts`, `host-build.ts`, `host-runner.ts`,
  `env.ts`, `server.ts`, UI first-run state; their tests.
- `tools/fetch-deps` (`--workspace`), `tools/check-vendor-free.mjs` (rewritten as the name guard), new pre-commit and
  Claude Code hook configuration, a one-time migration script.
- `packages/sdk`, `packages/ui-kit`, `tools/fetch-deps`: old-name aliases removed. New `templates/app`.
- `native/host`: no ABI change; the host already accepts `--plugin-dir=`. Plugin CMake projects take the SDK path
  from the core instead of a fixed relative path.
- Repo layout: `plugins/`, `apps/`, `tests/`, `archive/` and the root panel layout file leave the core; `pnpm-workspace.yaml`
  shrinks to `packages/*` and `tools/*`.
- Docs: `README.md`, `CLAUDE.md`, `tests/README.md`, all of `openspec/`.
- GitHub: a new public repo for the core; the existing private repo keeps the full history.
