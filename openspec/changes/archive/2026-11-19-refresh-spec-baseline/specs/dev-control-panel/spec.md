## MODIFIED Requirements

### Requirement: Start without a terminal
The panel SHALL start from a single launcher that shows no console window. The launcher opens the panel in the default browser. When a panel for the same workspace is already running on the selected port, the launcher opens that panel instead of starting a second server. A panel on the selected port for another workspace SHALL NOT be opened as though it served the requested workspace. When a shortcut launch finds that the selected port is held by a nonresponsive earlier panel process positively identified as originating from the same checkout and launcher mode, it SHALL stop that process, wait for the port to be released, and start a replacement. It SHALL NOT stop a responsive panel, a panel for another workspace, or an unrelated process. Before a repository-development launch starts its panel, it SHALL reconcile missing or stale dependencies in that checkout's workspace. A managed-tool setup failure SHALL NOT prevent the panel from starting; the affected tool SHALL retain its retryable failure state. Ordinary and explicitly selected workspaces SHALL retain their frozen dependency-install behavior.

#### Scenario: First start
- **WHEN** the developer runs the panel launcher and no panel is running on its selected port
- **THEN** the panel server starts with no visible console window and the browser opens the panel page

#### Scenario: Already running
- **WHEN** the developer runs the launcher while a panel for that workspace is already running on its selected port
- **THEN** the browser opens the running panel and no second server starts

#### Scenario: Different workspace on the selected port
- **WHEN** the developer runs the launcher while another workspace's panel is already running on its selected port
- **THEN** the launcher refuses to open that unrelated panel or change its workspace and reports the collision

#### Scenario: Stale shortcut process owns the port
- **WHEN** the developer runs a Start-menu launcher and its selected port is held by a nonresponsive panel process from that launcher's checkout and mode
- **THEN** the launcher stops only that process, waits for the port to be free, and opens a replacement panel

#### Scenario: Stale repository workspace dependencies
- **WHEN** the developer starts the repository-development launcher after the checkout workspace's dependency declarations changed
- **THEN** the launcher reconciles that workspace's dependencies and opens the panel without requiring a separate install command

#### Scenario: Managed tool setup fails
- **WHEN** a managed tool still cannot set up while the panel starts
- **THEN** the panel opens and that tool reports its failure with a retry action

#### Scenario: Unknown port owner
- **WHEN** the developer runs a Start-menu launcher and an unrelated or unverified process holds its selected port
- **THEN** the launcher leaves that process running and reports the collision

### Requirement: Project convention
A project SHALL be a folder with an `xrb-project.json` manifest in `projects/<section>/` of the selected project
repository (`projects/unsorted/` for no section). The manifest names the display name, the kind (`app`, packageable,
or `test`, run only), the entry (build output or static folder), an optional build script, the providers (`input`,
`display`, for apps `platform`) and per-plugin settings under `plugins.<name>`, including an app's package identity.

#### Scenario: Test project
- **WHEN** a project is a rig, camera, hand or calibration check
- **THEN** it has kind `test`: it can be run but not packaged

#### Scenario: New project
- **WHEN** a developer adds `projects/checks/camera-check/` to the project repository with an `xrb-project.json` of kind `test` and an `index.html`, and refreshes the panel
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
scrolls on its own, independent of the page. A named section SHALL be removed when archiving, deleting or moving a
project removes its final project. A deliberately created section that has not yet held a project MAY remain empty.

#### Scenario: Own sections

- **WHEN** the developer creates a section "Demos" and drags hello-cube into it
- **THEN** hello-cube's folder moves to `projects/demos/hello-cube` in the project repository, and the list shows it there after a reload

#### Scenario: Manage sections

- **WHEN** the developer renames a section, reorders sections, drags a project within or between sections, or deletes a section
- **THEN** the project-repository folders follow, deleted-section projects move to `projects/unsorted/`, and unrelated files go to the Recycle Bin

#### Scenario: Project in no section

- **WHEN** a project is in `projects/unsorted/`
- **THEN** it is shown in an "Unsorted" section at the end of the list

#### Scenario: Right-click menu

- **WHEN** the developer right-clicks a project row
- **THEN** a menu offers Favicon (a submenu with the icon actions), Rebuild when available, Rename, Archive and Delete in that order, and no row colour

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

### Requirement: Apps cursor preference
Settings SHALL show a Cursor field in its Apps section, when the All or Apps filter is selected, with the choices System (`system`), Ring (`ring`) and Ring with hover dot (`ring-dot`) and the hint that it applies on the next run and needs Mouse selected in the app's input options. Changing the field SHALL save immediately through `PUT /api/app-settings`; `GET /api/app-settings` SHALL return the current value. The preference SHALL be stored as `cursor` in `.xrb/app-settings.json` of the selected workspace, written atomically and preserving other fields of that file. A missing, unreadable-as-JSON or unrecognized stored value SHALL read as `system`. A write whose body is not an object holding exactly one `cursor` field with one of the three values SHALL be rejected with status 400 and SHALL leave the stored value unchanged. Each Desktop run with a panel address and each managed browser preview started by the panel, built or dev, SHALL pass the current value to the app page as the `xrb-cursor` launch parameter, without rebuilding the app. The preference SHALL NOT change the app's Mouse selection, which is passed separately as `xrb-mouse`.

#### Scenario: Default
- **WHEN** the workspace has no `.xrb/app-settings.json`
- **THEN** Settings shows System and the next run passes `xrb-cursor=system`

#### Scenario: Persist and launch
- **WHEN** the user selects Ring, reloads Settings and runs an app from the panel
- **THEN** Ring remains selected and the app page URL carries `xrb-cursor=ring` without a rebuild

#### Scenario: Unrecognized stored value
- **WHEN** `.xrb/app-settings.json` holds `cursor: "old-style"` and another field
- **THEN** the preference reads as `system`, and a later save of `ring` keeps the other field

#### Scenario: Invalid write
- **WHEN** a client sends `{ "cursor": "bad" }` or adds another field to the body
- **THEN** the panel answers 400 and the stored preference is unchanged

#### Scenario: Mouse not selected
- **WHEN** an app whose input selection excludes Mouse is run with the preference Ring
- **THEN** the page URL carries `xrb-mouse=0` together with `xrb-cursor=ring`

### Requirement: Single-row Activity header
The Activity card SHALL have one header row holding, from left to right, the Jobs and Log tabs, the selected tab's filters centred, and the selected tab's clear action at the right. With Log selected the centre SHALL hold the message, warning and error filters and any plugin debug filters, and the right SHALL hold Clear log, shown only when the log has entries. With Jobs selected the centre SHALL hold the queued, running, completed and failed job filters, and the right SHALL hold Clear jobs, shown only when a finished job is listed. The filters and clear action of the tab that is not selected SHALL be hidden. The tab content below the header SHALL hold only the log or the job list and their empty notes. The selected tab SHALL be remembered in the browser and SHALL default to Log. Arrow Left, Arrow Right, Home and End on a tab SHALL move selection and focus between the two tabs only. When the filters do not fit, the centre SHALL scroll horizontally inside the row.

#### Scenario: Jobs selected
- **WHEN** Jobs is the selected Activity tab and a finished job is listed
- **THEN** the header shows the four job-status filters in its centre and Clear jobs at the right, and the log filters and Clear log are hidden

#### Scenario: Log selected
- **WHEN** Log is the selected Activity tab and the log has entries
- **THEN** the header shows the log-level filters and any plugin debug filters in its centre and Clear log at the right, and the job filters and Clear jobs are hidden

#### Scenario: Nothing to clear
- **WHEN** the log is empty or no finished job is listed
- **THEN** the selected tab's clear action is hidden

#### Scenario: Reload
- **WHEN** the user selects Jobs and reloads the panel
- **THEN** Jobs is still selected

#### Scenario: Keyboard
- **WHEN** a tab has focus and the user presses Arrow Right, Arrow Left, Home or End
- **THEN** selection and focus move to the other tab, or to Jobs for Home and Log for End, and never into the filters or the clear action
