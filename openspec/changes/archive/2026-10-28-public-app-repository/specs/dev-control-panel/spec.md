## ADDED Requirements

### Requirement: Project package workspace
The panel SHALL install app dependencies from the selected project repository's package workspace before running an
app script. The project repository lockfile SHALL contain only app/project importers; plugin and packager importers
SHALL remain in the integration workspace lockfile. A build receipt SHALL identify the canonical project path so a
receipt from another checkout cannot validate the current build.

#### Scenario: Fresh public app checkout
- **WHEN** the selected project repository has no installed packages and the developer builds an app
- **THEN** the panel performs a frozen install in that repository root before running the app's build script

#### Scenario: Receipt from another checkout
- **WHEN** a project has the same ID and settings as one built in another project checkout
- **THEN** the other checkout's receipt does not make this checkout's build current

## MODIFIED Requirements

### Requirement: Project convention
A project SHALL be a folder with an `xrb-project.json` manifest in `projects/<section>/` of the selected project
repository (`projects/Unsorted/` for no section). The manifest names the display name, the kind (`app`, packageable,
or `test`, run only), the entry (build output or static folder), an optional build script, the providers (`input`,
`display`, for apps `platform`) and per-plugin settings under `plugins.<name>`, including an app's package identity.

#### Scenario: Test project
- **WHEN** a project is a rig, camera, hand or calibration check
- **THEN** it has kind `test`: it can be run but not packaged

#### Scenario: New project
- **WHEN** a developer adds `projects/Checks/camera-check/` to the project repository with an `xrb-project.json` of kind `test` and an `index.html`, and refreshes the panel
- **THEN** "camera-check" appears in the project list and can be run, with no other registration step

#### Scenario: Folder without a manifest
- **WHEN** a folder in a section folder of the project repository's `projects/` has a `package.json` but no `xrb-project.json`
- **THEN** it is not a project and is not listed, and the panel offers to create a manifest for it with defaults from its `package.json`

#### Scenario: Invalid manifest
- **WHEN** a manifest is not valid JSON or lacks a name or kind
- **THEN** the project is listed as broken, with the file path and the error, and cannot be run or built

### Requirement: Project list
The left column SHALL list the projects in sections the developer manages. Sections SHALL be the section folders of
the selected project repository's `projects/`, always lower case: a section named with capitals is saved lower case
and its folder renamed to match, and headings show names in capitals; `xrb-panel.json` in the project repository keeps
only their order, the order of projects and where archived projects came from. Each row SHALL show the project's
icon, name, last web build time and version, and a status dot while it launches (blue) or runs (green). The list
scrolls on its own, independent of the page.

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

### Requirement: Archive and delete
The panel SHALL let the developer archive a project: its folder moves to the selected project repository's
`projects/archive/<name>` and it leaves the project list; unarchiving moves it back to the section it came from
(Unsorted when that section is gone). The list has two tabs, Projects and Archive, each with a count. An archived
project can be selected, run and built from the Archive tab, and unarchived from its right-click menu.

#### Scenario: Archive
- **WHEN** the developer archives eyes-check
- **THEN** the project repository's `projects/Checks/eyes-check` moves to `projects/archive/eyes-check`, it shows under the Archive tab, and it still runs from there

#### Scenario: Unarchive
- **WHEN** the developer chooses Unarchive on eyes-check in the Archive tab
- **THEN** it moves back to `projects/Checks/eyes-check` and shows under the Projects tab, in its section
