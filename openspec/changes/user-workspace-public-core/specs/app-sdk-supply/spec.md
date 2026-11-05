# Spec Delta

## Purpose

Lets apps that live outside the core repo use the core's SDK and ui-kit at build, dev and edit time straight from the
core's sources, with no package registry and no machine-specific path stored in the app.

## ADDED Requirements

### Requirement: SDK from the core sources
An app SHALL import `@xr-build/sdk` and `@xr-build/ui-kit` by name and SHALL resolve them to the sources of the core
named by the `XRB_CORE` environment variable. An app's `package.json` SHALL NOT list either package, and no file in an
app SHALL contain a path to the core.

#### Scenario: Build uses the current core
- **WHEN** the SDK in the core is changed and the user builds an app from the panel
- **THEN** the app's bundle contains the changed SDK, with no install or publish step

#### Scenario: Portable app
- **WHEN** an app folder is copied to another machine with a different core path
- **THEN** it builds there from the panel without editing any of its files

### Requirement: Panel sets the core path
When the panel runs an app script (build or dev), it SHALL set `XRB_CORE` to the root of the core it runs from.

#### Scenario: Build from the panel
- **WHEN** Run, Build package, Publish, or preview preparation automatically builds an app
- **THEN** the build runs with `XRB_CORE` set to the panel's core root and succeeds

#### Scenario: Dev server from the panel
- **WHEN** the user starts an app's dev server from the panel and edits an SDK source file
- **THEN** the app reloads with the edited SDK

### Requirement: Clear failure without a core path
An app build or dev start without `XRB_CORE` set SHALL stop before bundling with a message that says to set
`XRB_CORE` to the core repo or to run it from the panel.

#### Scenario: Build in a plain terminal
- **WHEN** the user runs `pnpm build` in an app folder without `XRB_CORE`
- **THEN** the build stops with that message and writes no output

### Requirement: One three.js
An app and the SDK it uses SHALL share one copy of three.js: the app's own.

#### Scenario: Single three.js in the bundle
- **WHEN** an app that depends on three.js and imports the SDK is built
- **THEN** the bundle contains one copy of three.js

### Requirement: Editor resolution
The panel SHALL keep an ignored editor configuration in the workspace that maps `@xr-build/sdk` and `@xr-build/ui-kit`
to the core's sources, so editors resolve imports and types without a build.

#### Scenario: Autocomplete in the workspace
- **WHEN** the user opens the workspace in an editor after the panel has started once
- **THEN** imports of `@xr-build/sdk` resolve to the core's sources and its exports are offered for completion
