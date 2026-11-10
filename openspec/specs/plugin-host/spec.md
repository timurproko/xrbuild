# plugin-host Specification

## Purpose
Lets the XR Build host load input, display and platform integrations as separate plugin binaries, so the core stays
free of third-party SDKs and new devices or platforms are added without changing it.

## Requirements

### Requirement: Core runs without plugins
The generic host, SDK and control panel SHALL build, start and run an app without optional plugins, private workspace access or device-specific SDKs/runtimes; only the browser engine and standard core toolchain SHALL be required. Generic engine sources SHALL contain no plugin-specific branches, SDK includes or protocol implementation. The public repository MAY contain separately built, reviewed embedded plugins reached through the same neutral contracts as user plugins. Embedded-module membership SHALL NOT make optional integration dependencies mandatory for the generic core-only build.

#### Scenario: Clean core build
- **WHEN** the generic core is built on a machine with the browser engine and core toolchain but no optional plugin or device software
- **THEN** the build succeeds and the host runs an app with the built-in desktop display and none input provider

#### Scenario: No plugin code in the core
- **WHEN** generic engine sources are inspected for concrete plugin SDK includes, plugin library names or plugin-specific protocol branches
- **THEN** none is found and any reviewed embedded implementation lives in a separately built plugin module

#### Scenario: Reviewed embedded plugin
- **WHEN** a public module is built under the embedded workspace
- **THEN** it integrates through the existing plugin ABI or applicable neutral service contract without embedding its implementation into the host or requiring private workspace contents

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

### Requirement: Managed tool navigation recovery
A managed tool document invalidated by source or route changes SHALL enter non-modal automatic recovery rather than offer a retry that cannot clear invalidation. Recovery SHALL refuse embedded-frame activation, use only a currently registered same-panel tool route, verify the panel instance and repository/workspace identity, wait for idle runs/jobs/preparation, and bound automatic restart attempts. It SHALL NOT force active work to stop, install dependencies implicitly, bypass source-containment checks, or redirect into a different workspace. Unrelated preference refreshes SHALL NOT invalidate unchanged tool implementations. Panel shutdown SHALL stop accepting connections before draining its owned event streams and tools.

#### Scenario: Changed tool recovers safely
- **WHEN** a selected managed tool requires restart and its owning panel is idle
- **THEN** navigation performs at most one automatic restart within the recovery window and resumes the current registered route only after the replacement instance matches the original repository and workspace

#### Scenario: Busy or mismatched panel
- **WHEN** work is active or another panel identity occupies the origin during recovery
- **THEN** recovery does not force restart or follow an untrusted destination and presents bounded non-modal status with a route back to Apps

#### Scenario: Unchanged tool survives preferences refresh
- **WHEN** unrelated plugin preferences change without changing a tool declaration or executed module code
- **THEN** the existing tool remains usable rather than entering a permanent restart-required state
