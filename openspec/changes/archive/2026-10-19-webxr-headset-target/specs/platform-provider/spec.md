# Spec Delta

## ADDED Requirements

### Requirement: Packager target
A packager SHALL declare the target its packages run on: `host` (xrb-host with the selected plugins, the default when
it declares none) or `webxr` (a standalone headset). A project SHALL use only packagers of its own target.

#### Scenario: Packager without a target
- **WHEN** a packager declares no target
- **THEN** it is treated as a `host` packager and works unchanged

#### Scenario: Unknown target
- **WHEN** a packager declares a target other than `host` or `webxr`
- **THEN** it is not loaded and the panel reports the problem

### Requirement: Headset packages
A `webxr` packager's build step SHALL turn the built app, its icon and identity into a package for a standalone
headset, and SHALL receive no host runtime (`runtimeDir` empty), no plugins and no `pluginDirs`.

#### Scenario: Headset package
- **WHEN** a project with target `webxr` and platform `headset` is packaged
- **THEN** the `headset` packager receives the built app, icon and identity, no host runtime and no plugins, and
  writes one package file to the workspace's `builds/`
