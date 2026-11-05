# XR Build workspace

Projects and plugins for XR Build, kept apart from the XR Build core. This folder may be its own Git repository.
For repository development it is cloned independently at the core's ignored `.xrbuild/` path, with its own `.git`,
not as a submodule or a link to another checkout.

- `projects/<section>/<name>/`: projects (a folder with an `xrb-project.json`) in the panel's sections; `projects/Unsorted/`
  holds projects in no section, `projects/archive/` archived ones.
- `plugins/<name>/`: plugins (a native CMake project, packager and/or plugin-owned sample source). Importing a sample
  creates an independent copy in `projects/plugins/`, shown under `PLUGINS` in the Control Panel.
- `xrb-panel.json`: the panel's project list layout.
- Not versioned (`.gitignore`): `plugins/*/bin/` (built plugins), `third_party/` (`pnpm fetch-deps --workspace` in the
  core), `builds/` (packages), `node_modules/`, `dist/`, `build/`, `jsconfig.json`.

The user-mode control panel finds this folder through `XRB_HOME`, or at `%USERPROFILE%\.xrbuild`. The core
repository's development launcher explicitly selects that checkout's `.xrbuild/`; merely creating `.xrbuild/` does
not change the user default.
