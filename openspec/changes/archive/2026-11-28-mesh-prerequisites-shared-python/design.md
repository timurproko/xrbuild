# Design

## Context

Hand-mesh plugins run a sidecar program prepared by their own setup export (`mesh-runtime-setup`). Core checks that program's runtime folder against a receipt bound to the plugin source before every launch. Native Rebuild builds every selected plugin that has a `CMakeLists.txt` and expects an `xrb_*.dll`.

## Decisions

### Rebuild scope
A plugin that declares `handMesh` is excluded from the native plugin plan. Its CMake project, if any, belongs to its setup. Freshness uses the same plan, so it no longer reports such a plugin as permanently outdated.

### Stale runtimes are a setup step
Discovery stays passive but compares the receipt's source fingerprint with the current source (hashing a small source tree, not the runtime output). A mismatch reports `needsSetup` with a plain reason. The plan reports `refresh` when the runtime is installed and the setup exports `refresh`; Install then calls it, which re-checks files and writes a new receipt without downloading.

### Prerequisite state
While `needsSetup` or a setting-dependent kind is missing, the badge reads Prerequisite from the first render (including while a layer choice saves), Install is the only active action, and only the setting named by the missing kind's `requires` stays editable, so the person can switch back.

### Local setup files
A plan may return `input: { label, accept }`. The dialog shows a design-system button and the chosen name; the native input stays hidden. The file streams to `~/.xrbuild/setup-inputs/<uuid><ext>` (size-capped, extension-checked, abandoned copies older than a day removed) and its id is passed to the install route, which hands the path to `install({ from })` and deletes it when the job ends.

### Shared Python
A plugin manifest may declare `python: { version, wheels, sets? }` with exact versions and SHA-256 per wheel; a named set may name its own https index. Core pins uv by size and SHA-256, downloads it into `~/.xrbuild/python`, and runs it with no config, managed-only Python, copy link mode, and no PATH or registry changes. Two placements:

- `env`: one environment per plugin and lock under `~/.xrbuild/python/envs`, reused while ready; install receives `python` as its interpreter path.
- `runtime`: the exact standalone CPython is copied into the plugin's runtime folder with a `._pth` file and the chosen wheel set is installed into its `site-packages`, so the plugin's receipt covers every file that runs. Install receives `python.install(dest, { findLinks })`.

Wheels install with `--require-hashes --no-deps --only-binary :all:`. A not-ready environment adds uv, CPython and wheels to the consent plan, and the plan consent gains the lock key.

## Risks

- First-time Python provisioning needs network access to the uv release, the Python build mirror and the wheel index. Offline wheel installs use `findLinks`; the interpreter must already be cached.
- Plugins that move to `runtime` placement change their runtime contents and need one reinstall.
