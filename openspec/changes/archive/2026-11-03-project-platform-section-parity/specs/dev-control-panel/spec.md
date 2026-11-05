# dev-control-panel Specification

## MODIFIED Requirements

### Requirement: Plugin-owned sample projects

An installed plugin MAY declare bounded project samples from canonical source folders inside that plugin. Plugins
Manager SHALL show each valid sample in the owning plugin's details with its project name, optional description and an
Import action. The original sample SHALL remain plugin-owned installation content and SHALL NOT appear in the normal
project inventory until imported.

Import SHALL create an independent ordinary project copy at `projects/plugins/<project-folder>`, so the Projects list
shows it under the `PLUGINS` section. The panel SHALL validate project-folder uniqueness across live and archived
projects, reject links or source escapes, exclude dependency/generated output, validate the copied project manifest
and avoid leaving a partial project after failure. A successful import SHALL select the copied project in Control
Panel. Later plugin disablement, removal or sample updates SHALL NOT modify or remove an imported copy. An imported
sample declared as an app SHALL receive the same platform tabs and per-platform settings as every other app project.

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

#### Scenario: Imported app uses ordinary platforms

- **WHEN** the user imports the Hand Tracking app sample
- **THEN** the imported project offers the normal Desktop, Station, WebXR and installed headset platform choices

### Requirement: Project list

The left column SHALL list the projects in sections the developer manages. Sections SHALL be the section folders of
the selected project repository's `projects/`, always lower case: a section named with capitals is saved lower case
and its folder renamed to match, and headings show names in capitals; `xrb-panel.json` in the project repository keeps
only their order, the order of projects and where archived projects came from. Each row SHALL show the project's
icon, name, last web build time and version, and a status dot while it launches (blue) or runs (green). The list
scrolls on its own, independent of the page. A named section SHALL be removed when archiving, deleting or moving a
project removes its final project. A deliberately created section that has not yet held a project MAY remain empty.

#### Scenario: Own sections

- **WHEN** the developer creates a section "Demos" and drags hello-cube into it
- **THEN** hello-cube's folder moves to `projects/Demos/hello-cube` in the project repository, and the list shows it there after a reload

#### Scenario: Manage sections

- **WHEN** the developer renames a section, reorders sections, drags a project within or between sections, or deletes a section
- **THEN** the project-repository folders follow, deleted-section projects move to `projects/Unsorted/`, and unrelated files go to the Recycle Bin

#### Scenario: Project in no section

- **WHEN** a project is in `projects/Unsorted/`
- **THEN** it is shown in an "Unsorted" section at the end of the list

#### Scenario: Right-click menu

- **WHEN** the developer right-clicks a project row
- **THEN** a menu offers Rename, Archive and Delete, and no row colour

#### Scenario: Colour

- **WHEN** `xrb-panel.json` still holds a row colour for rig-check from an older panel
- **THEN** the rig-check row shows no colour bar, like every other row

#### Scenario: Archive removes the final project

- **WHEN** the developer archives the only project in a named section
- **THEN** the project moves to Archive, the empty named section disappears, and a later unarchive uses Unsorted

#### Scenario: Delete removes the final project

- **WHEN** the developer deletes the only project in a named section
- **THEN** the project goes to the Recycle Bin and the empty named section disappears

#### Scenario: Move removes the final project

- **WHEN** the developer drags the only project from one named section into another section or Unsorted
- **THEN** the source section disappears while the destination remains

#### Scenario: Section still contains a project

- **WHEN** archive, delete or move removes one project but another project remains in that section
- **THEN** the section remains in its current order

## ADDED Requirements

### Requirement: Archived project package isolation

Workspace package discovery SHALL exclude `projects/archive/**` while retaining every live project section. Archiving
a package project SHALL NOT make the workspace lock stale or prevent the Control Panel from starting.

#### Scenario: Restart after archiving a package project

- **WHEN** the developer archives a project with package dependencies and restarts the Control Panel
- **THEN** workspace setup ignores the archived package importer and the panel starts without requiring a lockfile update
