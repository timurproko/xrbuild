# plugin-host Specification

## Purpose
Lets the XR Build host load input, display and platform integrations as separate plugin binaries, so the core stays
free of third-party SDKs and new devices or platforms are added without changing it.

## Requirements
### Requirement: Core runs without plugins
The core host, SDK and control panel SHALL build, start and run an app with no plugin present and with no third-party
SDK, runtime or device software on the machine; only the browser engine and the standard toolchain are required. Core
sources SHALL contain no plugin-specific code: plugins are reached only through the plugin ABI, the host channel and
the packager contract.

#### Scenario: Clean core build
- **WHEN** the core is built on a machine that has only the browser engine and the toolchain, and no plugin
- **THEN** the build succeeds and the host runs an app in the built-in `desktop` display with the `none` input provider

#### Scenario: No plugin code in the core
- **WHEN** the core sources are searched for third-party SDK includes, plugin library names or plugin-specific protocol code
- **THEN** none is found

### Requirement: Plugin discovery
The host SHALL discover plugin DLLs in the `plugins` folder next to its executable and then in every folder given with
`--plugin-dir=` (the panel passes each workspace plugin's `bin/` folder), and SHALL identify each plugin by the name and role it
reports, not by its file name. When a role and name is found twice, the first found SHALL win and the other SHALL be
rejected with a reason listed by `--list-plugins`.

#### Scenario: Plugin next to the host
- **WHEN** a DLL in `<exe>\plugins\tracker\` reports name `tracker` and role `input`
- **THEN** `--input=tracker` selects it

#### Scenario: Plugin in a workspace folder
- **WHEN** the host is started with `--plugin-dir=<workspace>\plugins\input-tracker\bin` and a DLL there reports name `tracker`, role `input`
- **THEN** `--input=tracker` selects it

#### Scenario: Same plugin found twice
- **WHEN** an input plugin named `tracker` exists both in `<exe>\plugins` and in a `--plugin-dir=` folder
- **THEN** the one next to the exe is used and `--list-plugins` lists the other as rejected because the name is taken

#### Scenario: Unknown plugin requested
- **WHEN** the host is started with `--input=missing` and no discovered plugin reports that name and role
- **THEN** the host logs the available input providers and exits with a non-zero code

### Requirement: ABI version check
Every plugin SHALL report the plugin ABI version it was built against (`native/plugin-sdk/include/xrb_plugin.h`), and
the host SHALL load only plugins whose major ABI version matches its own. A plugin with a newer minor version SHALL
still load if the major matches.

#### Scenario: Incompatible plugin
- **WHEN** a plugin reports ABI major 2 to a host with ABI major 1
- **THEN** the host does not call into it beyond the version query, logs both versions and treats it as not found

#### Scenario: Newer minor version
- **WHEN** a plugin reports ABI 1.3 to a host with ABI 1.1
- **THEN** the host loads it

### Requirement: One plugin per role
The host SHALL run at most one input provider, one display provider and one platform provider at a time, chosen by
`--input=`, `--display=` and `--platform=`. Each role SHALL have a built-in default: input `none`, display `desktop`,
platform none (standalone).

#### Scenario: Defaults
- **WHEN** the host starts without role options, without `--config=` and without an `xrb-app.json` next to its exe
- **THEN** it runs the app in the desktop display, with no hands and no station connection

### Requirement: Plugin configuration
The host SHALL pass each selected plugin its configuration as one JSON object built from the project manifest and from
`--plugin.<name>.<key>=<value>` options, the options merged over the manifest. The host SHALL NOT interpret
plugin-specific keys.

#### Scenario: Plugin option forwarded
- **WHEN** the host is started with `--input=tracker --plugin.tracker.exposureUs=8000`
- **THEN** the `tracker` plugin receives `{"exposureUs": 8000}` merged over its manifest configuration

### Requirement: Plugin failure reporting
A plugin that fails to load or start SHALL NOT stop the app unless it is the selected display. The host SHALL report
the failure in its log, in the `@status` output and to the page.

#### Scenario: Input plugin fails
- **WHEN** the selected input plugin fails to start (missing device, missing runtime)
- **THEN** the app keeps running without hands and the page receives a `failed` input status with the plugin's message

#### Scenario: Display plugin fails
- **WHEN** the selected display plugin fails to start
- **THEN** the host logs the plugin's message and exits with a non-zero code, unless `--display-fallback=desktop` is given
