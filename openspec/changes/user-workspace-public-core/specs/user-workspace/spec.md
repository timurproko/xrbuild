# Spec Delta

## Purpose

Keeps the user's projects, plugins and panel layout in a workspace folder outside the core repo, so the user can
version them privately while the core stays a separate, publishable engine.

## ADDED Requirements

### Requirement: Workspace location
The workspace SHALL be the folder named by the `XRB_HOME` environment variable when it is set, and
`%USERPROFILE%\.xr-build` otherwise. The panel, `fetch-deps` and the migration tool SHALL all resolve the same folder,
and the panel SHALL show the resolved path.

#### Scenario: Default location
- **WHEN** `XRB_HOME` is not set and the panel starts
- **THEN** the panel uses `%USERPROFILE%\.xr-build` and shows that path in its top bar

#### Scenario: Overridden location
- **WHEN** `XRB_HOME` is set to `D:\work\my-xr`
- **THEN** the panel and `fetch-deps --workspace` both use `D:\work\my-xr`

### Requirement: Workspace layout
A workspace SHALL hold projects in section folders of `projects/` (`projects/<section>/<name>`, `projects/Unsorted/`
for none), archived projects in `projects/archive/<name>`,
plugins in `plugins/<name>/`, the panel layout in `xrb-panel.json`, and an optional `xrb-workspace.json` for
settings. Build output and fetched binaries (`plugins/*/bin/`, `third_party/`, `node_modules/`, `dist/`, `build/`)
SHALL be listed in the workspace's `.gitignore`.

#### Scenario: Project in the workspace
- **WHEN** the user adds `projects/Demos/demo/` with an `xrb-project.json` to the workspace and refreshes the panel
- **THEN** "demo" is listed in the section "Demos", and can be built and run

#### Scenario: Nothing in the workspace root
- **WHEN** the user looks at the workspace folder
- **THEN** projects are only under `projects/`, never directly in the workspace root

#### Scenario: Build output not versioned
- **WHEN** the user runs `git status` in a workspace after building plugins and apps
- **THEN** no file under a plugin's `bin/`, `third_party/`, `node_modules/`, `dist/` or `build/` is shown

### Requirement: Workspace creation
When the resolved workspace folder does not exist or holds no workspace, the panel SHALL offer to create one with the
standard layout, its `.gitignore` and one starter app from the core's template. The panel SHALL NOT run git in the
workspace; versioning it is the user's choice.

#### Scenario: First start
- **WHEN** the panel starts and `%USERPROFILE%\.xr-build` does not exist
- **THEN** the panel shows an empty state with "Create workspace", and after it is clicked the folder exists with the
  standard layout and a starter app that builds and runs on the desktop display

#### Scenario: Existing folder is not overwritten
- **WHEN** the workspace folder already holds files
- **THEN** creation only adds the missing standard folders and files and changes no existing file

### Requirement: Core holds no projects
The core repo SHALL contain no project, plugin or panel layout. The panel SHALL list projects only from the workspace,
and the only app-shaped folder in the core SHALL be the new-project template, which the panel does not list.

#### Scenario: Core checkout without a workspace
- **WHEN** the panel runs from a fresh core checkout and the workspace is empty
- **THEN** the project list is empty and offers "New project"

#### Scenario: New project from the template
- **WHEN** the user clicks "New project" and names it "globe"
- **THEN** `projects/Unsorted/globe/` is created in the workspace from the core's template and appears under Unsorted

### Requirement: Workspace plugins
The panel SHALL treat every folder under the workspace's `plugins/` with a native build file as a native plugin and
every package there declaring a packager as a packager. Native plugins SHALL be built against the plugin SDK of the
core the panel runs from and installed into the plugin's own `bin/` folder.

#### Scenario: Rebuild host builds workspace plugins
- **WHEN** the user clicks Rebuild host
- **THEN** the core host is built, then each workspace plugin, and each plugin's files end up in
  the plugin's `bin/` folder

#### Scenario: Packager from the workspace
- **WHEN** a workspace plugin declares a packager for a platform and a project selects that platform
- **THEN** the panel shows that packager's fields and can build a package with it

#### Scenario: Freshness covers workspace plugins
- **WHEN** a source file of a workspace plugin is newer than its installed build
- **THEN** the top bar shows the host as outdated

### Requirement: Host loads workspace plugins
When the panel starts the host, it SHALL pass each workspace plugin's `bin/` folder with a `--plugin-dir=`. A packaged
app SHALL contain its selected plugins next to its exe and SHALL NOT depend on any workspace.

#### Scenario: Run with a workspace plugin
- **WHEN** a project selects an input provider that exists only in a workspace plugin's `bin/`
- **THEN** a run from the panel starts the host with that provider

#### Scenario: Package without the workspace
- **WHEN** a package built from that project is started on a machine with no workspace
- **THEN** the host finds the plugin in the package's own `plugins` folder and starts with it

#### Scenario: Missing workspace plugin
- **WHEN** a project selects a plugin that is not built in the workspace
- **THEN** the run is refused with a message naming the plugin and offering Rebuild host

### Requirement: Workspace plugin dependencies
`fetch-deps --workspace` SHALL read each workspace plugin's dependency list and lock file and fill the workspace's
`third_party/`, with the same pinned-hash checks as the core's dependencies. Plain `fetch-deps` SHALL fetch only the
core's dependencies.

#### Scenario: Fetch plugin dependencies
- **WHEN** the user runs `pnpm fetch-deps --workspace`
- **THEN** each workspace plugin's binaries are copied into the workspace's `third_party/` and verified against its
  lock file

#### Scenario: Hash mismatch
- **WHEN** a plugin dependency's file does not match its pinned hash
- **THEN** the command fails naming the plugin, the file and both hashes, and leaves the existing copy in place
