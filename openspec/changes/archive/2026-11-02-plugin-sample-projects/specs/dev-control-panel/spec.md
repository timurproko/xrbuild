# dev-control-panel Specification

## ADDED Requirements

### Requirement: Plugin-owned sample projects

An installed plugin MAY declare bounded project samples from canonical source folders inside that plugin. Plugins
Manager SHALL show each valid sample in the owning plugin's details with its project name, optional description and an
Import action. The original sample SHALL remain plugin-owned installation content and SHALL NOT appear in the normal
project inventory until imported.

Import SHALL create an independent ordinary project copy at `projects/plugins/<project-folder>`, so the Projects list
shows it under the `PLUGINS` section. The panel SHALL validate project-folder uniqueness across live and archived
projects, reject links or source escapes, exclude dependency/generated output, validate the copied project manifest
and avoid leaving a partial project after failure. A successful import SHALL select the copied project in Control
Panel. Later plugin disablement, removal or sample updates SHALL NOT modify or remove an imported copy.

#### Scenario: Plugin offers a sample

- **WHEN** an installed plugin declares a valid contained sample project
- **THEN** Plugins Manager shows that sample in the plugin details with an Import action while the original is absent from the Projects list

#### Scenario: Import a sample

- **WHEN** the user imports a sample with the project name `Tracker Lab`
- **THEN** the panel creates an independent validated copy at `projects/plugins/tracker-lab`, opens Control Panel with it selected, and lists it under `PLUGINS`

#### Scenario: Imported copy is ordinary user content

- **WHEN** the user edits, archives or deletes an imported sample, or later disables its source plugin
- **THEN** the action affects only the imported project and the plugin's original sample and managed tools remain usable

#### Scenario: Duplicate import name

- **WHEN** a live or archived project already has the requested folder name with any letter casing
- **THEN** the import dialog reports the collision without overwriting either project or creating a partial destination

#### Scenario: Unsafe sample source

- **WHEN** a declared sample path escapes its plugin, resolves through a link, lacks a valid project manifest or contains an unsupported filesystem entry
- **THEN** Plugins Manager reports the sample metadata problem and the panel copies nothing

### Requirement: Plugin-controlled provider visibility

An enabled plugin MAY mark one or more of its native providers hidden from ordinary project role choices without
disabling the plugin, its panel tools, samples or settings. Hidden providers SHALL remain discoverable for build
freshness and explicit runtime configuration. Projects that do not already select a hidden provider SHALL NOT see it
as an available choice. The panel SHALL preserve an existing saved selection and present it only as unavailable until
the user replaces or removes it.

#### Scenario: Diagnostic input stays out of new choices

- **WHEN** an enabled input plugin hides its fixture provider and also declares a tool and sample
- **THEN** project Input selectors do not offer that provider, while the plugin tool and sample Import action remain available

#### Scenario: Existing manifest selects a hidden provider

- **WHEN** a project manifest already stores a provider that its plugin now hides
- **THEN** the panel preserves the manifest, identifies the saved provider as unavailable, and does not offer it to other projects

#### Scenario: Provider becomes ready

- **WHEN** the plugin removes its provider from the hidden list after implementing production input
- **THEN** the existing stable provider ID becomes an ordinary selectable choice without a project migration
