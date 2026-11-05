## ADDED Requirements

### Requirement: Manifest-backed plugin catalog
The panel SHALL treat a workspace folder as a plugin only when it contains `xrb-plugin.json`. Every plugin manifest SHALL declare a bounded non-empty `title`, a supported `type` and a semantic `version` in `major.minor.patch` form. Plugins Manager SHALL use the manifest title and version as the plugin's displayed product identity. Native provider or package metadata MAY remain available for role/runtime diagnostics but SHALL NOT replace the manifest product version.

#### Scenario: Versioned plugin
- **WHEN** a workspace plugin has a valid manifest with version `0.1.0`
- **THEN** Plugins Manager shows its manifest title, type and version `0.1.0`

#### Scenario: Missing or invalid version
- **WHEN** a manifest-backed plugin omits `version` or declares an invalid version
- **THEN** Plugins Manager reports the manifest problem and does not invent a version from a provider binary or package

#### Scenario: Renamed plugin leaves generated output
- **WHEN** a removed or renamed plugin folder remains only as ignored `bin/` or `build/` output without `xrb-plugin.json`
- **THEN** the folder is absent from Plugins Manager and its binaries are not passed to the host as workspace plugin directories

#### Scenario: Enabled input provider uses manifest identity
- **WHEN** an enabled manifest-backed input plugin has a discovered stable provider ID
- **THEN** the Input selector offers that provider under the manifest title without changing the saved provider ID

### Requirement: Enabled plugins provision optional standalone targets
The panel SHALL offer an optional standalone platform tab only when an enabled manifest-backed plugin declares that supported target through bounded panel metadata. Disabling the owning plugin SHALL refresh the current project UI and remove the tab without requiring a panel restart. A project manifest already selecting the unavailable target SHALL remain readable and SHALL NOT be silently rewritten.

#### Scenario: Disable the standalone browser integration
- **WHEN** the developer disables the enabled plugin that declares the standalone browser target
- **THEN** the standalone browser tab disappears from the project UI immediately while unrelated platform tabs remain available

#### Scenario: Saved project selects a disabled target
- **WHEN** a project was saved with a standalone target whose declaring plugin is now disabled
- **THEN** the panel shows that saved target as unavailable and preserves the manifest unchanged

### Requirement: Managed navigation starts no child process
Following or reloading a panel-managed tool SHALL initialize only its contained application runtime inside the panel process. Navigation SHALL NOT launch a shell, package installer, compiler, development command, visible console or child service. Required pinned package setup SHALL remain complete before panel listen, and camera/model/recording/native-service creation SHALL remain behind explicit application actions.

#### Scenario: Open a prepared tracking tool
- **WHEN** the developer follows the enabled tracking tool's menu entry after panel startup and takes no capture action
- **THEN** the application document opens with no new child process or visible console and with zero camera streams, model workers, recordings, native builds and native camera services

#### Scenario: Explicit capture after navigation
- **WHEN** the initialized tracking tool later receives an explicit capture or calibration action
- **THEN** only the existing action-specific camera/model/native-service ownership rules apply
