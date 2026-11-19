## Purpose

Apps get `@xr-build/sdk` and `@xr-build/ui-kit` at build, dev and edit time from the sources of the core named by `XRB_CORE`, with no package registry and no core path stored in the app.

## ADDED Requirements

### Requirement: SDK from the core sources
An app created from the core's app template SHALL import `@xr-build/sdk` and `@xr-build/ui-kit` by name, and its build configuration SHALL alias both names to `packages/sdk/src/index.ts` and `packages/ui-kit/src/index.ts` under the folder named by the `XRB_CORE` environment variable. The template's `package.json` SHALL NOT list either package, and no template file SHALL contain a path to the core. Both packages SHALL be private to the core repository and SHALL NOT be obtained from a package registry.

#### Scenario: Build uses the current core
- **WHEN** an SDK source file in the core changes and the app is built again from the panel
- **THEN** the app's bundle contains the changed SDK with no install or publish step

#### Scenario: Portable app
- **WHEN** an app folder is copied to a machine whose core is at another path
- **THEN** it builds from that machine's panel without editing any of its files

### Requirement: Panel sets the core path
The panel SHALL set `XRB_CORE` to the root of the core it runs from in the environment of every app build script and app dev server it starts. The panel process SHALL also set `XRB_CORE` for itself at start unless it is already set.

#### Scenario: Build from the panel
- **WHEN** the panel runs an app's build script
- **THEN** the script's environment has `XRB_CORE` set to the panel's core root

#### Scenario: Dev server from the panel
- **WHEN** the panel starts an app's dev server
- **THEN** the dev server's environment has `XRB_CORE` set to the panel's core root and may serve files from that folder

### Requirement: Clear failure without a core path
The template's build configuration SHALL throw before bundling when `XRB_CORE` is not set, with a message that says to run the app from the panel or to set `XRB_CORE` to the core repository.

#### Scenario: Build in a plain terminal
- **WHEN** the user runs the app's build script without `XRB_CORE`
- **THEN** the build stops with that message and writes no output

### Requirement: One three.js
The template's build configuration SHALL deduplicate `three`, so the app and the SDK sources it bundles use the app's own copy.

#### Scenario: Single three.js in the bundle
- **WHEN** an app that depends on three.js and imports the SDK is built
- **THEN** the bundle contains one copy of three.js

### Requirement: Editor resolution
When the panel creates a workspace or a project, it SHALL write `jsconfig.json` at the root of the selected project repository, mapping `@xr-build/sdk` and `@xr-build/ui-kit` to the core's source entry files, and SHALL rewrite it only when its content changes. The workspace template SHALL ignore that file in Git.

#### Scenario: New project
- **WHEN** the user creates a project from the panel
- **THEN** the project repository's `jsconfig.json` maps both package names to the entry files of the core the panel runs from

#### Scenario: Unchanged configuration
- **WHEN** the panel creates another project and the mapping is already current
- **THEN** `jsconfig.json` is not rewritten
