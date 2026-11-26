# XR Build workspace

Projects and plugins for XR Build, kept apart from the XR Build core. This folder may be its own Git repository.
For repository development it is cloned independently at the core's ignored `.xrbuild/` path, with its own `.git`,
not as a submodule or a link to another checkout.

- `projects/<section>/<name>/`: projects (a folder with an `xrb-project.json`) in the panel's sections; `projects/unsorted/`
  holds projects in no section, `projects/archive/` archived ones.
- `plugins/<name>/`: plugins (a native CMake project, packager and/or plugin-owned sample source). Importing a sample
  creates an independent copy in `projects/plugins/`, shown under `PLUGINS` in the Control Panel.
- `xrb-panel.json` and `xrb-plugins.json`: personal panel layout and plugin preferences, ignored by Git.
  Update keeps these settings and user projects local even if incoming defaults differ; it reports skipped defaults
  for explicit inspection/adoption rather than overwriting personal data.
- `config/plugins/<id>/config.json`: user-owned plugin configuration, initialized only when missing and ignored by Git.
  Invalid existing configuration is reported rather than replaced; credentials and signing material never belong in product defaults.
- `config/projects/<key>/run.json`: personal bundled-project run choices, scoped to the core/project and ignored by Git.
  Save/Restore in bundled details changes these choices without editing product source; invalid files require manual review.
- Not versioned (`.gitignore`): `plugins/*/bin/` (built plugins), `third_party/` (`pnpm fetch-deps --workspace` in the
  core), `builds/` (packages), `node_modules/`, `dist/`, `build/`, `jsconfig.json`.

Authored projects and curated dependency locks remain versionable; the template does not silently hide all source.
Choose explicit ignores for installation-only project folders. Ignoring a file does not untrack an existing copy:
repository owners must migrate tracked personal settings with verified backups, never delete someone's local data.
A locally present generated workspace lock is kept by Update; reconcile dependencies through explicit package preparation.
The core's own lock is not personal state and its dependency install stays frozen.

The user-mode control panel finds this folder through `XRB_HOME`, or at `%USERPROFILE%\.xrbuild`. The core
repository's development launcher explicitly selects that checkout's `.xrbuild/`; merely creating `.xrbuild/` does
not change the user default.
