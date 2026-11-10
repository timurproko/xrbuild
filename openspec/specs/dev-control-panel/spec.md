# dev-control-panel Specification

## Purpose
A local control panel in the browser where a developer manages the projects of their workspace: per-project settings
and providers, web and package builds, built packages, runs on the display, and live status, logs and debug views.

## Requirements

### Requirement: Start without a terminal
The panel SHALL start from a single launcher that shows no console window. The launcher opens the panel in the default browser. When a panel for the same workspace is already running on the selected port, the launcher opens that panel instead of starting a second server. A panel on the selected port for another workspace SHALL NOT be opened as though it served the requested workspace. When a shortcut launch finds that the selected port is held by a nonresponsive earlier panel process positively identified as originating from the same checkout and launcher mode, it SHALL stop that process, wait for the port to be released, and start a replacement. It SHALL NOT stop a responsive panel, a panel for another workspace, or an unrelated process.

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

#### Scenario: Unknown port owner
- **WHEN** the developer runs a Start-menu launcher and an unrelated or unverified process holds its selected port
- **THEN** the launcher leaves that process running and reports the collision

### Requirement: Local-only access
The panel SHALL accept connections only on the loopback interface. It SHALL reject any request whose Host header is not a loopback name and port of the panel. It SHALL reject any state-changing request whose Origin is not the panel itself.

#### Scenario: Request from another site
- **WHEN** a page from another origin sends a request to the panel's build endpoint
- **THEN** the panel rejects it and starts nothing

#### Scenario: Access from the network
- **WHEN** another machine tries to connect to the panel's port on the developer machine's network address
- **THEN** the connection is not accepted

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

### Requirement: Unique project names
Project folder names SHALL be unique across all sections and the archive; a project keeps its name (and its colour) when it moves between sections.

#### Scenario: Same name in two sections
- **WHEN** `projects/Demos/globe` and `projects/Checks/globe` both hold a manifest
- **THEN** the first one is listed normally and the second is listed as broken, naming the section that already has a project of that name

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

### Requirement: Delete
Delete SHALL move the project folder to the Recycle Bin after a confirmation in the panel's own dialog.

#### Scenario: Delete
- **WHEN** the developer deletes a project and confirms
- **THEN** its folder is in the Recycle Bin and the project is gone from the list

### Requirement: Project view
The middle column SHALL show the selected project in a project card, with runtime settings and the conditional Build card below it. The project card SHALL hold the icon on black, the name, folder action and Run controls.

#### Scenario: Tags
- **WHEN** the project uses the default icon, its icon changed since the last package build, or it is archived
- **THEN** the card shows a tag saying so

#### Scenario: Run turns into Stop
- **WHEN** the developer clicks Run
- **THEN** the Run button turns into Stop in place while the project runs

#### Scenario: Stop from anywhere
- **WHEN** an app runs and the developer has scrolled the log so that the Stop button is out of view
- **THEN** the top bar shows the project's icon, name and Stop, and clicking it stops the app

### Requirement: Project icon
Every project SHALL have one icon: a PNG named in its manifest, or the default icon when none is named. For an app it is the window and taskbar icon of the running app, transparency kept, the source of the package thumbnail, and the favicon of its finalized browser build. The panel SHALL show each project's icon on black in the list and in the project view, pass it to the host when running the project, and finalize successful browser output with that same custom or generated icon before accepting its build receipt. Finalization SHALL give the built index one unambiguous page-favicon declaration while preserving manifests, touch icons, mask icons and unrelated metadata. Local preview, packaging and publication SHALL consume that same verified output. When the project's build has a 3D icon (`icon.js`), the panel SHALL report its preview URL with the project.

#### Scenario: Custom icon
- **WHEN** the developer sets `icon.png` as the icon of globe and builds or previews the app
- **THEN** the panel shows that image for the project, the running window and package thumbnail use it, and the finalized browser page uses it as its favicon locally and when published

#### Scenario: No icon set
- **WHEN** a project's manifest names no icon
- **THEN** the panel shows the default icon with a "default icon" tag, and the package, running app and finalized browser page use that generated default icon

#### Scenario: Existing page favicon
- **WHEN** an app's built index already declares a generic or stale page favicon
- **THEN** build finalization replaces page-favicon declarations with one reference to the current project icon while preserving its web manifest, touch icons, mask icons and unrelated head metadata

#### Scenario: Icon changes after build
- **WHEN** the project icon bytes change while the prior browser build receipt is otherwise current
- **THEN** the next preview, package or publication preparation refreshes the finalized favicon and receipt so the verified output contains the new icon

#### Scenario: Repeated finalization
- **WHEN** an unchanged successful browser build is prepared more than once
- **THEN** its index contains one project favicon declaration and the output remains unchanged

#### Scenario: Not a PNG
- **WHEN** the developer chooses an icon file that is not a PNG
- **THEN** the panel refuses to save it and says the icon must be a PNG

#### Scenario: 3D icon reported
- **WHEN** hello-cube's build holds `icon.js`
- **THEN** the project list gives hello-cube's icon model as `/preview/hello-cube/icon.js`, and a project without one has no model

### Requirement: Icon studio
The Favicon item of a project row's right-click menu SHALL open the icon menu as a submenu beside it, the row menu staying open behind; the project icon itself has no menu and a click on it does nothing. The icon menu offers: the default sphere's colours (while the project has no icon of its own), Upload image… (the dialog: choose a PNG, frame part of it, Take), Render 3D… (only when the build has a 3D icon) and Remove (only when the project has its own icon; the project then shows the default sphere). Render 3D… SHALL open the icon studio: a modal that previews the app's 3D icon alone (Render preview), without loading the app, at 512 x 512 on a checkered background showing transparency, with the current thumbnail (the icon on black) beside it, Take, Reset and a help line naming the controls. The icon holds still: left-drag turns it, middle-drag pans it, right-drag or scroll zooms it and Reset restores the starting view. Take, Reset and the help line show disabled until the icon has loaded. Take SHALL save the current frame as the project's icon PNG and update the thumbnail.

#### Scenario: Open the studio
- **WHEN** the developer chooses Render 3D… for globe
- **THEN** the studio shows a spinner while the icon loads, then the live preview and the thumbnail side by side, and an × in the corner closes it

#### Scenario: Pause an animation
- **WHEN** the developer renders the launcher's rocket, whose icon animates in launchers
- **THEN** the studio shows it holding still and offers no Pause

#### Scenario: Page without the SDK
- **WHEN** the developer opens Favicon for rig-check, a plain page without a build or `icon.js`
- **THEN** the menu offers Upload image… and no Render 3D…

#### Scenario: Icon menu
- **WHEN** the developer opens Favicon from globe's row menu while it shows the default sphere
- **THEN** the menu shows the colours, Upload image… and Render 3D…, and picking a colour recolours the sphere at once while the menu stays open

#### Scenario: Upload an image
- **WHEN** the developer chooses Upload image… for rig-check, picks a PNG, frames part of it (drag to move, right-drag or scroll to zoom) and clicks Take
- **THEN** the framed 512 x 512 square becomes rig-check's icon and the thumbnail shows it on black, Delete drops the image without changing the icon, Reset fits the whole image again, closing the dialog without Take keeps the icon, and a file that is not a PNG is refused

#### Scenario: No 3D icon
- **WHEN** the developer opens the menu of a project whose build has no `icon.js`
- **THEN** the menu offers no Render 3D…

#### Scenario: Remove an icon
- **WHEN** the developer chooses Remove icon for globe, which has a rendered icon
- **THEN** globe shows the default sphere again and its menu offers the colours

#### Scenario: Render the 3D icon
- **WHEN** the developer chooses Render 3D… for globe
- **THEN** the studio shows only the globe at once, without the app's page, holding still, with Take, Reset and the help line disabled until it has loaded; dragging turns it, middle-dragging pans it, right-dragging or scrolling zooms it, Reset restores the starting view, the thumbnail preview follows the view on black, and repeated Takes save the same image

#### Scenario: Take a view
- **WHEN** the developer turns the globe in the studio to show one continent and clicks Take
- **THEN** the project's `icon.png` holds that view at 512 x 512 with a transparent background, the panel shows it as the project icon, and the project shows the "icon changed" tag until the next package build

#### Scenario: Used by the next build
- **WHEN** the developer builds a package after taking a new icon
- **THEN** the package's thumbnail and window icon are the new image

#### Scenario: Cancel
- **WHEN** the developer closes the icon studio without clicking Take
- **THEN** the project's icon file is unchanged

### Requirement: Project settings
The selected project SHALL show `Develop`, `Publish`, and `Build` workflow tabs inside its project card using the same full-width underlined navigation-tab treatment as the Activity card's `Log` and `Jobs` tabs; the selected tab SHALL NOT have a filled or white active treatment. Develop SHALL show only local Desktop and Browser preview choices, with Run/Stop and Dev server, Fullscreen and 2D controls as applicable. Build SHALL show only distributable choices with package identity/version/history and Build actions. Publish SHALL show publisher/slug fields and Publish or Unpublish actions independently of the selected package target. The card's project icon SHALL align to the top of its identity row and remain with the project title. Folder then Open JSON SHALL be right-aligned in the identity row; Publish SHALL have Open JSON only, preceded by an open link that targets the version chosen in Live version (an inspected release's archive, published or not, otherwise the live app while it is reachable), and the published route SHALL be right-aligned in the workflow-tab row. The primary action of every surface (Run or Stop, Publish or Update with its confirmed Unpublish, Build) SHALL sit left-aligned in an action row below all of the surface's content. The page SHALL show no separate project-workflow column label. Runtime controls SHALL appear only on Develop, package controls only on Build, and publication controls only on Publish. The active workflow surface SHALL persist while switching projects, and each surface SHALL remember its last platform choice per project. The remaining project settings, persistence, compatibility, responsive behavior and availability rules remain as specified.

#### Scenario: Card-local project workflow
- **WHEN** the developer selects a project
- **THEN** its project card contains full-width underlined Develop, Publish, and Build tabs matching Jobs and Log, no separate project-workflow heading appears above it, and switching tabs retains the specified preview/distribution separation

#### Scenario: Aligned project identity actions
- **WHEN** a project has a published route
- **THEN** its icon and title share the identity row, Folder immediately precedes Open JSON at that row's right edge (on Publish, the open link then JSON only), the URL is right-aligned in the workflow-tab row, and the primary action sits left-aligned below the surface content

#### Scenario: Change the title
- **WHEN** the developer changes an app's title and presses Enter
- **THEN** the manifest's name and platform title are updated without changing its package ID

#### Scenario: Saving without a button
- **WHEN** the developer changes a dropdown or commits a title edit
- **THEN** the changed setting is saved without a Save button; Open JSON on Build offers direct access to the manifest

#### Scenario: Starter scene follows its icon colour
- **WHEN** the developer changes a generated starter app's `iconColor` and rebuilds or runs it from source
- **THEN** its text, ring, rim light and 3D sphere icon use the matching palette

#### Scenario: Edit launcher card description
- **WHEN** the developer opens JSON from the action row on any workflow surface
- **THEN** editing the manifest's optional description changes that app's local launcher card copy, while an empty description shows no copy

#### Scenario: Fixed identity field
- **WHEN** the platform's packager declares an identity field fixed after packaging
- **THEN** that field is shown read-only to avoid creating a separate app on the platform

#### Scenario: Empty title
- **WHEN** the developer clears the title
- **THEN** the panel does not save and says the title is required

#### Scenario: Package version entry
- **WHEN** the developer types a package version without requesting Build
- **THEN** the version is not saved yet

#### Scenario: Choose a platform button
- **WHEN** the developer selects a different Platform button
- **THEN** that button becomes active and the target and platform save together without a second control or Save button

#### Scenario: Native standalone
- **WHEN** an app manifest has no target or platform and the developer opens Settings
- **THEN** Platform shows Desktop, with Display and Input available and no package action

#### Scenario: Browser standalone
- **WHEN** the manifest has target `webxr` but no platform
- **THEN** Platform shows Browser, offers monitor-only Display and Input choices for the local browser preview, and offers no package action

#### Scenario: Select a platform for a different target
- **WHEN** the developer chooses a platform whose packager declares target `webxr` from a native standalone project
- **THEN** one save sets the manifest's target to `webxr` and platform to that packager's name, and Build shows its package fields

#### Scenario: Disabled selection
- **WHEN** the selected platform plugin is disabled and the developer edits another setting
- **THEN** the UI offers the stored target's standalone fallback, does not offer the disabled plugin as a new choice and keeps its stored manifest selection for re-enabling

#### Scenario: Provider not built
- **WHEN** the manifest selects a platform not available from providers or packagers
- **THEN** the selector keeps its stored value readable and marks it unavailable without pretending that a target mismatch means the plugin is missing

#### Scenario: Manifest changed on disk
- **WHEN** the manifest was edited on disk after the panel loaded it and the developer changes Platform
- **THEN** the panel does not write and says the manifest changed

#### Scenario: Desktop run controls
- **WHEN** the developer selects Desktop for an app with a dev script
- **THEN** the platform row shows Fullscreen, 2D and Dev server on the same row while space is available

#### Scenario: Refresh displays
- **WHEN** the developer connects, disconnects or renames a monitor and chooses Refresh displays from the Display selector's context menu
- **THEN** the Display choices are rediscovered in place, the saved Display remains selected when available, and a disconnected saved desktop monitor is replaced by the primary/first available monitor without a Missing monitor option

#### Scenario: Build-only physical targets
- **WHEN** the developer selects Station or a packaged headset under Build
- **THEN** no Fullscreen, 2D or Dev server preview controls are shown

#### Scenario: App-level preview toggles
- **WHEN** the developer changes 2D, Fullscreen or Dev server on Desktop and selects standalone WebXR, or changes one on WebXR and returns to Desktop
- **THEN** the same project-level values remain selected without modifying the project manifest, while each platform retains its own Display and Input selections

#### Scenario: Manifest action stays available
- **WHEN** the developer switches between Display and Build
- **THEN** Open JSON follows the hero's folder action on Develop and Build and remains available without a folder on Publish

#### Scenario: Display and Build separate intent
- **WHEN** the developer changes between the Display and Build surfaces in the project-column title
- **THEN** Develop shows only Desktop/Browser preview controls in one project card, Publish shows publication controls, and Build shows package controls and distributable targets in that card, and the card expands or collapses smoothly

#### Scenario: Surface platform choices are independent
- **WHEN** the developer selects Desktop under Display, selects a headset package under Build, and returns to Display
- **THEN** Desktop is restored without exposing the package-only headset choice in Display

#### Scenario: Surface persists across projects
- **WHEN** Build is active and the developer selects another project in the sidebar
- **THEN** Build remains active while that project's remembered Build platform is restored

#### Scenario: Platform content height follows the selected target
- **WHEN** the developer changes among Display or Build platform tabs with different field counts
- **THEN** the project card smoothly expands or shrinks to the selected target's natural content height, using equal platform-to-field spacing without an instantaneous jump or retained empty gap

#### Scenario: Balanced project fields
- **WHEN** the project card has regular desktop width
- **THEN** Display and Input, Publisher and App slug, Next version and Live version, and Package title and version all use two equal columns, the Platform tabs carry a field title like those fields, and all pairs stack at the shared narrow breakpoint

#### Scenario: Sticky project action
- **WHEN** the developer scrolls the selected project's primary action above the app bar
- **THEN** the app bar shows the project icon and name followed immediately by a compact matching Run, Stop or lifecycle action

#### Scenario: Standalone WebXR run choices
- **WHEN** the developer selects the standalone WebXR tab under Display
- **THEN** Run, Dev server when available, Fullscreen, 2D, a monitor Display selector and Input are offered for the local browser preview

#### Scenario: Packaged headset is build-only
- **WHEN** the developer selects a WebXR packager platform under Build
- **THEN** the project offers Build but no local Run, Dev server, Fullscreen or 2D controls, and that platform is absent from Display

#### Scenario: Published root slug
- **WHEN** an app is published at its publisher's root route without a slug
- **THEN** the disabled App slug field stays empty and the hero link shows the published URL in deployment-detail text styling

### Requirement: Build card layout
The Build card SHALL appear only when package or publication controls are available. It SHALL show responsive controls with action buttons aligned to the full height of adjacent inputs, without build-age badges, a standalone Build action or duplicate platform control. When packaging is available, the Open Folder action SHALL appear beside the Build title. Package items SHALL appear below the controls without a separate history title, divider or empty placeholder when no matching package exists.

#### Scenario: No build controls
- **WHEN** an app has neither package nor publication controls
- **THEN** the panel omits the Build card entirely

#### Scenario: Stable Build heading
- **WHEN** the developer switches between a platform with the Open Folder action and a publication-only platform without it
- **THEN** the Build heading reserves the icon height and the controls below it do not shift

#### Scenario: Package history
- **WHEN** the selected platform supports package creation and matching packages exist
- **THEN** the Build card lists only packages matching the current project's selected package identity, shows their name, file and size, omits duplicate version and age, provides a standard tooltip-labeled delete icon per item with the same visible hover treatment as other icon actions, and shows the selected channel's `builds/<channel>/` folder action beside Build

#### Scenario: Empty package history
- **WHEN** no package matches the current project's selected channel and package identity
- **THEN** the Build card keeps its package controls but shows no package-history divider or empty placeholder

#### Scenario: No redundant status labels
- **WHEN** a project has a current build or previous package version
- **THEN** the project list and Build controls omit `built … ago` and `last …` labels

### Requirement: Web build
When Run in built mode, Build package, Publish, or preview preparation needs a missing or stale app output, the panel SHALL run the project's configured build script in the project folder. It SHALL stream the output live (without terminal colour codes), persist a safe build receipt, and report success or failure with the exit code.

#### Scenario: Successful automatic build
- **WHEN** the developer invokes an action that needs a current build of hello-cube
- **THEN** the build output appears live in the Jobs list, the result shows success, the requested action continues, and the build time is updated

#### Scenario: Failing build
- **WHEN** the build script exits with a non-zero code
- **THEN** the panel shows the failure, the exit code and the last output lines, and leaves the previous build time unchanged

### Requirement: Package build
The panel SHALL build a package for an app project from its entry folder and settings through its matching packager, writing it to a separate workspace `builds/<channel>/` folder (`desktop`, `cx`, `quest`, or another selected platform). It SHALL use the same packaging engine as the packager's command line, so the package matches a command-line build for the same inputs. Progress and errors are streamed live, and the result names the package file, its version and its size.

#### Scenario: Package a project
- **WHEN** the developer clicks Build package on a project with package ID "Globe Tour" and version 0.1.1
- **THEN** a package for "Globe Tour" version 0.1.1 is written to the selected package channel under the workspace's `builds/`, and the panel shows its path and size

#### Scenario: No web build
- **WHEN** the developer builds a package for a project whose entry folder has no `index.html`
- **THEN** the panel builds the app first and creates the package only after that build succeeds

#### Scenario: Desktop package
- **WHEN** a developer opens a Desktop app
- **THEN** the Build card offers package creation and history through the built-in portable Windows packager without adding another Platform choice

#### Scenario: No packager
- **WHEN** no packager is present for the selected platform or for the target's standalone choice
- **THEN** the panel omits package controls and package history while still running the project

#### Scenario: Selected plugin not built
- **WHEN** a selected provider is a plugin that is not built in the workspace
- **THEN** the package build is refused with a message naming the plugin and asking for a host rebuild

#### Scenario: Package progress dialog
- **WHEN** the developer starts Build package
- **THEN** a modal streams the package job output and, when it finishes, offers Close and View job

#### Scenario: One package build at a time
- **WHEN** a package build is running and the developer starts another
- **THEN** the second is refused until the first finishes

### Requirement: Next version suggestion
After a successful package build the panel SHALL record the packaged version for the project. It SHALL then suggest the next patch version for the following build. Before a build, it SHALL warn when the chosen version is not higher than the last packaged version for that package ID.

#### Scenario: Suggest after build
- **WHEN** a project was last packaged as 0.1.0
- **THEN** the version field suggests 0.1.1 without adding a redundant last-version badge

#### Scenario: Same version again
- **WHEN** the developer starts a package build with version 0.1.0 and 0.1.0 was already packaged for that ID
- **THEN** the panel warns that the station platform may reject an existing version and asks for confirmation before building

### Requirement: Activity column
The Activity region SHALL contain Analytics and one Activity card whose Jobs and Log tabs remain inside that card in that order without resetting saved selection. The non-tab Analytics heading SHALL use the same shared top-row rhythm as an Activity tab row without receiving tab affordances. The page SHALL NOT render a separate Activity column label above those cards. The existing live status, job state, duration, collapsible output and Clear behavior remain unchanged.

#### Scenario: Card-local activity tabs
- **WHEN** the developer views a project with no active run
- **THEN** Analytics and the Jobs/Log Activity card are visible without a separate Activity heading, and selecting Jobs does not move activity content outside its card

#### Scenario: Package built by a script
- **WHEN** a package in the selected workspace `builds/<channel>/` folder was built with the packager's command line, not with the panel
- **THEN** the Build card's package history lists it when its channel and package identity match the current project

### Requirement: Run on the display
For both native Desktop and standalone WebXR, a non-fullscreen managed preview SHALL open as a normal decorated browser/native window centered on the selected monitor at the same 1520 x 856 outer-window target, constrained to fit that monitor with the existing safety margin. Fullscreen preview SHALL retain its display-filling/kiosk behavior. The existing run ownership, lifecycle, monitor selection, dev-server and camera behavior remain unchanged.

#### Scenario: Matched windowed Desktop and WebXR previews
- **WHEN** the developer selects a monitor, leaves Fullscreen off, and runs either a Desktop or standalone WebXR project
- **THEN** the managed window opens centered on that monitor at the same constrained 1520 x 856 outer-window target with normal window controls

#### Scenario: Run the built app
- **WHEN** the developer clicks Run on globe with Dev server off
- **THEN** Run immediately becomes disabled Launching so another start cannot be requested, the host shows the app's build output on the 3D display, and the action then becomes Stop

#### Scenario: Stop the native app
- **WHEN** the developer clicks Stop while a native Desktop app is running
- **THEN** Stop immediately becomes disabled Stopping until the host and optional dev server have exited

#### Scenario: Run with the dev server
- **WHEN** the developer clicks Run with Dev server on, and then saves a source file of the app
- **THEN** the app on the display reloads with the change, without restarting the host

#### Scenario: Another host already running
- **WHEN** the developer clicks Run while a host started elsewhere is running
- **THEN** the panel says that another host is running and offers to stop it, and does not start a second host

#### Scenario: Run with the dev server after changing Platform
- **WHEN** the developer enables Dev server, changes between a native tab and standalone WebXR, and clicks Run
- **THEN** the selected app starts from source with live reload using a native host or browser preview as selected

#### Scenario: WebXR preview on a selected monitor
- **WHEN** the developer selects a monitor, leaves Fullscreen off and runs standalone WebXR
- **THEN** a normal managed browser window with standard title-bar controls opens on that monitor and loads the built or dev preview

#### Scenario: Fullscreen WebXR preview
- **WHEN** the developer selects a monitor, enables Fullscreen and runs standalone WebXR
- **THEN** a managed browser window starts in kiosk fullscreen on that monitor, covers the taskbar, and loads the built or dev preview with immersive-session permission without showing an Enter fullscreen button

#### Scenario: WebXR launch and stop lifecycle
- **WHEN** the developer clicks Run for standalone WebXR and then clicks Stop after launch
- **THEN** Run is disabled and reads Launching during startup, then changes to Stop, the project-row running bulb pulses in the same red as Stop, and Stop closes the panel-owned browser window plus any preview dev server

#### Scenario: Local Desktop launcher opens rebuilt apps
- **WHEN** the developer rebuilds a workspace app and runs the launcher on Desktop from the panel
- **THEN** the launcher opens that local preview build, while a packaged launcher without panel context continues to open the published route

#### Scenario: Local launcher lists active workspace apps
- **WHEN** the launcher runs in a bounded panel preview
- **THEN** its catalog contains every non-archived buildable app regardless of publication state, excludes the current launcher, follows the project sidebar's section/item order from top to bottom as card order from left to right, shows generated default sphere icons as 85%-scale 3D geometry in the selected app colour, refreshes that colour while open, omits generic filler descriptions, and shows no synthetic empty-slot cards

### Requirement: 2D mode

The 2D checkbox in the project platform row SHALL be remembered once per project, shared by Desktop and standalone WebXR, and SHALL define the
local run's 2D/3D intent without changing the manifest or rebuilding the app. On Desktop and a panel browser preview,
2D SHALL use an Orthographic managed camera and 3D SHALL use a Perspective managed camera. A change SHALL update an
open managed app live. On a station/display session that can switch views, 2D SHALL also switch the running display to
mono and 3D SHALL switch it to stereo; the checkbox SHALL show the host-reported physical view. A station display that
cannot switch SHALL retain the existing disabled behavior while running. Stereo display output and immersive WebXR
sessions SHALL use perspective eye cameras. Published standalone WebXR SHALL not inherit the panel-local 2D choice and
SHALL start Perspective.

#### Scenario: Switch while running
- **WHEN** the developer ticks 2D mode while an app runs in 3D on the display
- **THEN** the app continues as a flat picture without restarting, and unticking it brings the 3D effect back

#### Scenario: Display that cannot switch
- **WHEN** a project runs on a display provider that reports it cannot switch views at run time (for example a display plugin set to a fixed 2D mode)
- **THEN** the 2D mode checkbox is disabled until the app stops

#### Scenario: Desktop changes projection live
- **WHEN** a managed app is running on Desktop and the developer checks 2D
- **THEN** the same running app changes to an Orthographic mono camera without a rebuild or restart, and unchecking it restores Perspective

#### Scenario: Station switches while running
- **WHEN** a managed app runs in 3D on a switchable station display and the developer checks 2D
- **THEN** the display switches to a mono picture, the managed mono camera is Orthographic, and unchecking restores stereo perspective eye rendering

#### Scenario: Local WebXR preview
- **WHEN** the developer opens a panel WebXR preview in its dedicated browser profile and changes that project's shared 2D choice
- **THEN** the open preview reads its token-bounded panel projection and changes between Orthographic and Perspective without affecting another project's preview

#### Scenario: WebXR launcher preview keeps live 2D control
- **WHEN** a panel WebXR launcher preview opens an app, returns to the launcher, opens another app, and the developer alternates the launcher's 2D checkbox
- **THEN** the page currently shown in that preview window follows every Orthographic/Perspective change without restarting the preview

#### Scenario: Published WebXR stays Perspective
- **WHEN** the same app is opened directly from its published standalone WebXR route
- **THEN** it starts Perspective and an immersive session uses the browser's perspective eye cameras regardless of the panel's saved 2D choice

#### Scenario: Desktop launcher destination follows live 2D
- **WHEN** a panel-launched Desktop launcher opens a rebuilt workspace app and the developer changes the launcher's 2D checkbox
- **THEN** the destination changes between Orthographic and Perspective live through the same host without rebuilding, republishing or relaunching it

### Requirement: Clean stop
The panel SHALL stop a running host through the host's normal close path, so the display provider ends its 3D output and session and the input provider releases its devices. Only if the host has not exited 20 seconds after the close request SHALL the panel force it to end, and it then warns that the display may need a replug.

#### Scenario: Stop
- **WHEN** the developer clicks Stop on a running project
- **THEN** the host log shows the clean shutdown, the host exits with code 0, and the 3D display returns to 2D

#### Scenario: Host closed on the display
- **WHEN** the host is closed with Esc on the display
- **THEN** the panel shows the project as stopped, with the exit code

### Requirement: Live run status
The Running card SHALL show at all times (dashes while nothing runs), refreshed at least once per second while a host started by the panel runs: page frames per second and frame time; hand tracking rate and state; camera-to-page hand latency, number of tracked hands, render resolution per eye, connected page clients and running time. None of these values are drawn inside the running app.

#### Scenario: Running app
- **WHEN** globe runs on the 3D display with hand input
- **THEN** the panel shows a page fps near 60 and a hand rate updating every second, and the app on the display shows no stats overlay

#### Scenario: Run a test project
- **WHEN** the developer runs the rig-check test project with hand recording on
- **THEN** the rig check page shows on the 3D display, and the recorded hand stream is saved to the file named in its settings

#### Scenario: Host crash
- **WHEN** the host exits unexpectedly with a non-zero code
- **THEN** the panel shows the project as stopped, with the exit code and the last host log lines

### Requirement: Host log
The Log card SHALL show the host log live like a game-engine console: one row per message with time, a source badge and the text, zebra rows, multi-line messages kept together, and repeats of a message collapsed into one row with a ×N count. Warnings are amber and errors red. The header SHALL hold filters for Messages, Warnings and Errors, each with its count, a Debug filter and a Clear link.

#### Scenario: Only errors
- **WHEN** the developer turns Messages and Warnings off
- **THEN** only error rows are shown, the two filters are dimmed and struck through, the counts of all three kinds stay visible, and the choice is remembered

#### Scenario: Plugin debug output
- **WHEN** the developer turns on the Debug filter (off by default) while an app runs with a plugin input provider
- **THEN** the plugins' own debug output (for example the input provider's gesture events and profiling) is shown in the log

#### Scenario: Empty log
- **WHEN** the log is empty, or fills up
- **THEN** the Clear link stays in place (disabled while the log is empty) and the log keeps one height, so the page does not move

### Requirement: Panel dialogs and controls
Confirmations, questions and messages SHALL use the panel's own dialogs, not the browser's alert, confirm or prompt. Buttons follow one style: secondary (raised, bordered), primary (filled accent) and danger (filled red), with the same hover (fill tinted, border highlighted) and pressed states for all. Dropdowns use the panel's own list. Light and dark follow the system theme.

#### Scenario: Delete confirmation
- **WHEN** the developer chooses Delete on a project
- **THEN** a panel dialog asks for confirmation with equal-width Cancel and red Delete buttons

### Requirement: Camera debug view
When the developer runs a project with the Cameras option and its input provider publishes debug images, the panel SHALL show each image stream the provider labels (for example per-camera infrared, depth or colour images at a reduced rate and size, with the 2D hand detections drawn on them when the tracker provides them) and each camera's frame rate. The host SHALL send debug images only for a run started with that option.

#### Scenario: Open the debug view
- **WHEN** the developer runs globe with Cameras on and a camera-based input provider
- **THEN** within 2 seconds the panel shows the labelled images of every connected camera, updating at least 5 times per second, with the detected hands marked

#### Scenario: Run without the debug view
- **WHEN** the developer runs a project with Cameras off
- **THEN** the host sends no camera images, and the page fps on the display is not lower because of the debug view

#### Scenario: No cameras
- **WHEN** a host runs with input `none`, or no camera is connected
- **THEN** the debug view says why no images are shown, instead of showing an empty area

### Requirement: Hand data debug view
The debug view SHALL show the tracked 3D hands in the panel frame as top and side views of the joints, with each hand's ID, pinch state and age. It updates at the tracking rate.

#### Scenario: Hand moves toward the panel
- **WHEN** a tracked hand moves toward the display glass
- **THEN** the side view shows the joints approaching the panel plane, and the hand keeps the same ID

### Requirement: Host freshness check
The panel SHALL check whether the `xrb-host` build and the build of every workspace plugin exist and whether one is older than its newest source file. The host SHALL use its build-system record of the last successful build. Each workspace plugin SHALL use the newer of its built library and a panel-owned record written only after that plugin's build completes successfully, so a successful build that does not relink an unchanged library still becomes current while a failed build does not. Plugins left next to the host by an older build SHALL also make the host outdated. The top bar SHALL show a chip and a Rebuild host button only when something is missing or outdated. The panel SHALL warn before a package build with an outdated host.

#### Scenario: Outdated host
- **WHEN** a host or workspace plugin source file was changed after its last successful build
- **THEN** the top bar shows the host as outdated, and a package build asks for confirmation first

#### Scenario: Plugins left next to the host
- **WHEN** the host's build folder still holds plugins installed there by an older build
- **THEN** the top bar shows the host as outdated, and Rebuild host removes those plugin folders

#### Scenario: Rebuild host
- **WHEN** the developer clicks Rebuild host while no host is running and every build completes successfully
- **THEN** the host and then every workspace plugin are rebuilt with the output streamed live as a job, and the chip and menu indicator disappear on success and remain absent after refresh

#### Scenario: Successful plugin build without relinking
- **WHEN** a workspace plugin source input is newer than its DLL but the requested rebuild succeeds without rewriting that DLL
- **THEN** the successful-build record makes the plugin current and the panel no longer requests another rebuild

#### Scenario: Failed plugin build
- **WHEN** a workspace plugin rebuild fails after its sources changed
- **THEN** no successful-build record is advanced for that plugin and the rebuild indication remains visible

### Requirement: Build target
The app's manifest SHALL continue to store `target` as `host` (or omit it, the native default) or `webxr`. The project controls SHALL infer the displayed target from their single platform choice; they SHALL NOT show a Settings heading, a Platform label, or a second Target or Runs on control. The platform choices SHALL share their toolbar row with applicable run options. A packager SHALL be available only when its declared target matches the project's target.

#### Scenario: Switch a project to the headset
- **WHEN** the developer selects a `webxr` platform from Platform
- **THEN** the manifest's target becomes `webxr` and its platform becomes that packager's name in the same save

#### Scenario: Manifest without a target
- **WHEN** a project's manifest has no `target`
- **THEN** the panel treats it as a native project and retains its valid run and packaging behavior

### Requirement: Headset project view
The panel SHALL label the primary action **Run** for both native and WebXR projects. A native Run SHALL use the host and its existing Stop and status controls. A WebXR Run SHALL open the built web app in a browser tab without launching the native host or claiming to monitor an immersive headset session. Native Display, Input, 2D, camera and hand controls SHALL be hidden for WebXR projects. Packaging for a WebXR packager SHALL remain host-free.

#### Scenario: Host controls hidden
- **WHEN** the developer opens a WebXR project
- **THEN** Display, Input, 2D mode and native camera and hand controls are hidden, while Run remains visible

#### Scenario: Run the browser build
- **WHEN** a developer clicks Run on a WebXR project
- **THEN** the panel builds the app when its recorded output is missing or stale, opens the preview only after success, requests no host run, and does not report native host status for that tab

#### Scenario: Browser build unavailable
- **WHEN** a WebXR project has neither an existing app output nor a build script
- **THEN** Run is disabled with an explanation

#### Scenario: Run the native project
- **WHEN** a developer clicks Run in built mode on a native project
- **THEN** the panel builds the app when needed, then starts the host and shows Stop while it is running

#### Scenario: Package for the headset
- **WHEN** the developer clicks Build package on a WebXR project with a matching packager selected
- **THEN** the panel builds the app when needed, writes the package to its workspace `builds/<channel>/` folder without a host build or publisher operation, and shows its path and size

### Requirement: WebXR publication settings
The Publish card SHALL offer publisher selection, slug and one state-appropriate publication action for a selected local app project, independently of its package target/platform. Selecting a publisher configures publication without a separate enable control. These settings SHALL save independently from Platform, package identity and native settings and SHALL show the selected publisher's resulting URL. Publishing SHALL operate on the selected local project's validated build, never a different public-source project with the same name. Draft and archived test projects SHALL NOT be uploaded or published implicitly.

#### Scenario: Configure publication
- **WHEN** a developer selects an available publisher and valid slug for a local app
- **THEN** the panel saves its stable publication identity without changing platform or package identity

#### Scenario: Native or headset package platform
- **WHEN** a developer selects a native app or headset package platform
- **THEN** Publish retains the app's publication status and available actions independently of packaging

#### Scenario: Package before publication
- **WHEN** a developer packages an app before publishing its configured WebXR route
- **THEN** the package uses the canonical route without triggering publication

#### Scenario: Publisher unavailable
- **WHEN** a manifest names a disabled or missing publisher
- **THEN** the saved selection remains readable but Publish is unavailable

#### Scenario: Publish one selected local app
- **WHEN** a developer chooses Publish for a configured local app while other projects and archived tests exist
- **THEN** the panel builds and publishes only that app's verified output, leaves every other project local, and shows the verified public route

#### Scenario: Not eligible
- **WHEN** a local test project or unconfigured draft is selected
- **THEN** the panel offers no production Publish action for it

### Requirement: Publisher selector
The panel SHALL use its custom dropdown for publisher selection. It SHALL list installed publishers only, without an empty publisher option, and SHALL persist a sole installed publisher as the unambiguous default. It SHALL show each publisher's validated HTTPS origin hostname while saving the stable publisher name. Publication settings SHALL remember a slug per publisher and restore that slug when its destination is selected again.

#### Scenario: Labeled publisher
- **WHEN** publisher `local` declares origin `https://example.test` and an optional user-facing label
- **THEN** the dropdown shows `example.test` while the project manifest stores `local`

#### Scenario: Provider-specific slug
- **WHEN** a developer selects another Publisher and gives it a different Slug
- **THEN** the panel remembers both provider-to-slug associations and restores each Slug when its Publisher is selected again

#### Scenario: Sole installed publisher
- **WHEN** standalone WebXR has no saved publisher and exactly one publisher plugin is installed
- **THEN** the dropdown contains and selects that publisher directly, persists it, and does not offer a `Select publisher` item

### Requirement: Automatic app builds
The panel SHALL NOT expose a standalone Build button. Run in built mode, Build package and Publish SHALL each verify the recorded app output and build automatically when it is missing or stale. The Build card SHALL omit redundant build-age and last-packaged badges. Publish SHALL send only a recorded successful unchanged build to the publisher. Run SHALL continue to open the local browser preview, and package creation SHALL remain independent from publication.

#### Scenario: Successful current build
- **WHEN** a WebXR project has a successful current build and the developer clicks Publish
- **THEN** the panel starts a publication job through its selected publisher

#### Scenario: Build missing or changed
- **WHEN** no successful build is recorded or the build output changed after success and the developer clicks Publish
- **THEN** the panel runs Build first and publishes automatically only if the new build succeeds and remains current

#### Scenario: Automatic build fails
- **WHEN** Publish invokes Build and that build fails or project settings change during it
- **THEN** the publisher is not called and the publication job reports a specific actionable failure

#### Scenario: Non-publication action builds
- **WHEN** Run or Build package needs to rebuild the app
- **THEN** the build receipt updates but no publisher operation starts

#### Scenario: Browser preview stays local
- **WHEN** Run is clicked for a published WebXR project
- **THEN** the panel opens the local preview and does not change the deployed site

### Requirement: Publication status in the Build card
The panel SHALL use the selected publisher's effective status consistently for the deployment URL, pending operation, action and destination fields. It SHALL show the last safe error and diagnostic link when available. A failed request SHALL NOT appear deployed. A failed-but-deployed record SHALL remain removable with Unpublish. For release-capable publishers, status SHALL distinguish the verified Live version from the requested or draft version. Reloading SHALL query publishers rather than treating local intent as deployment success.

#### Scenario: Publication pending
- **WHEN** a publisher reports an operation still running
- **THEN** Publish shows the pending operation and diagnostic link, retaining the last verified live version separately from a candidate

#### Scenario: Publication failed
- **WHEN** a publisher reports failure
- **THEN** Publish shows the error and does not present the requested route or version as successfully deployed

#### Scenario: Panel restarted
- **WHEN** the panel restarts after a publication request
- **THEN** it reloads status and supported release history from the selected publisher

#### Scenario: Published action
- **WHEN** the selected route is published or failed-but-deployed
- **THEN** a release-capable publisher offers Update (labelled Publish) and a separate confirmed Unpublish action, while a legacy publisher retains Unpublish in the primary slot; Publisher stays selectable so another destination can be chosen, and Slug is read-only with the deployed slug retained independently of package target

#### Scenario: Published URL hover
- **WHEN** the pointer is elsewhere in the publication row but not over the URL text
- **THEN** the URL does not receive its link hover treatment

### Requirement: Confirm destructive publication changes
Unpublish and changing a live slug within the selected publisher SHALL use the panel's own confirmation dialog. A route move SHALL NOT promise that the old route remains reachable.

#### Scenario: Unpublish confirmed
- **WHEN** a developer confirms Unpublish
- **THEN** the panel requests removal of only that identity from the selected publisher and retains its local build and settings for republish

#### Scenario: Live route changed
- **WHEN** a developer changes the slug of a deployed identity without changing Publisher
- **THEN** the panel explains the route and installed-package impact in complete sentences and offers compact equal-width Cancel and Move actions before submitting the change

#### Scenario: Confirmation cancelled
- **WHEN** the confirmation is cancelled
- **THEN** no publisher request or manifest change is made

### Requirement: Publication API validation
The HTTP API SHALL enforce app-kind eligibility, manifest freshness, publisher availability, route validation, ownership, build receipt and confirmation rules independently of package target/platform. UI validation alone SHALL NOT authorize publication.

#### Scenario: Malicious route
- **WHEN** a client submits traversal, separators, an external URL or another invalid slug
- **THEN** the API rejects it without calling the publisher

#### Scenario: Route owned by another identity
- **WHEN** the selected publisher reports that the normalized route belongs to another identity
- **THEN** the API reports the collision and preserves both projects' state

#### Scenario: Wrong target
- **WHEN** a publication endpoint is called for a non-app project
- **THEN** the API rejects the request

#### Scenario: Native package selection
- **WHEN** a configured app with a native target or package platform requests publish or confirmed unpublish
- **THEN** the API executes the verified operation without mutating its target/platform

### Requirement: Responsive publication controls
Publication fields, actions and status SHALL remain readable and operable at desktop and narrow layouts without hiding package controls.

#### Scenario: Narrow panel
- **WHEN** the Build card is shown at the narrow breakpoint
- **THEN** publication fields and actions stack without horizontal clipping and status links remain reachable

### Requirement: Publication action controls
The primary compact action SHALL be Publish for an unpublished app and Update for an existing deployment with release support; both SHALL read Publish to the developer and, for a release-capable publisher, SHALL confirm first by naming the new version, the destination and what it replaces; confirmed Unpublish SHALL remain separately available for a deployed release-capable app. Legacy publishers SHALL retain the shared Publish/Unpublish primary slot. During local publication work or status checks, conflicting actions and destination/version editing SHALL be disabled. Job actions SHALL retain their dimensions, show a centered spinner and keep an accessible operation name. When published and idle, Publisher SHALL remain selectable so each destination keeps its own status, draft version and history, and Slug SHALL be read-only without stale validation errors. Publication jobs SHALL NOT block the rest of the panel. A late HTTP start response SHALL NOT regress a newer terminal job to queued/running.

#### Scenario: Publish in progress
- **WHEN** a Publish job is running for the selected project
- **THEN** its action retains its size, shows a centered spinner with Publishing… as its accessible name, locks conflicting fields/actions, refuses duplicate clicks, and does not block navigation or Activity

#### Scenario: Unpublish in progress
- **WHEN** an Unpublish job is running after confirmation
- **THEN** its action retains its size, shows a centered spinner with Unpublishing… as its accessible name, locks conflicting fields/actions, refuses duplicate clicks, and does not open a progress modal

#### Scenario: Publication field error alignment
- **WHEN** a validation error adds content below one publication field
- **THEN** both field titles remain top-aligned and the action remains aligned with the input row rather than the error bottom

#### Scenario: Fast operation completes before HTTP response
- **WHEN** a completed job event arrives before the operation's initial HTTP response
- **THEN** the terminal state and corresponding Publish/Update/Unpublish action remain visible without a stuck spinner or incorrect live version

#### Scenario: Update or activation in progress
- **WHEN** Update or Make live is queued or running
- **THEN** the panel exposes the specific accessible operation name, blocks conflicting release operations and preserves the previous verified live version until verification succeeds

### Requirement: Published deployment list
Every publisher with preloaded published status SHALL appear below the controls as its own row, titled by its displayed HTTPS hostname with the complete deployed URL as its link. All live rows SHALL remain visible when Publisher changes, and the action SHALL manage only the selected destination. Rows SHALL omit a separate history title, relative-age badge and row action.

#### Scenario: Multiple published destinations
- **WHEN** an app is live on more than one Publisher
- **THEN** the Build card shows one block per live deployment, each titled with its publisher hostname and followed by its complete linked URL, regardless of which Publisher is selected

### Requirement: Immediate publication completion
After a successful publication job, the panel SHALL immediately update the selected action, compact deployment status and supported release history using the verified result while publisher queries converge. Reveal transitions SHALL use shared primitives, SHALL NOT replay on ordinary status refresh and SHALL respect reduced-motion preferences. Retained history SHALL remain visible after Unpublish.

#### Scenario: Published deployment appears
- **WHEN** a Publish job completes successfully before publisher status queries have converged
- **THEN** the spinner stops and the primary action becomes Update (labelled Publish) for a release-capable publisher or Unpublish otherwise, while the verified deployment status appears and background refresh continues

#### Scenario: Unpublished deployment disappears
- **WHEN** an Unpublish job completes successfully before publisher status queries have converged
- **THEN** the spinner stops, the primary action becomes Publish, the active deployment marker disappears, and other destinations and retained history remain intact

#### Scenario: Updated or activated release
- **WHEN** Update or Make live completes with a verified release result
- **THEN** the Live marker changes to that release without replaying deployment creation UI, changing the selected publisher or changing the canonical URL

### Requirement: Independent publication destinations
When the selected destination is unpublished, changing Publisher SHALL select another destination without moving or removing existing deployments. The panel SHALL restore each publisher's slug and status. Published destination fields SHALL remain locked until unpublished. While a save or job runs, refreshes SHALL retain the latest selection and actions SHALL NOT target an older persisted provider. Completion SHALL never select another provider automatically. Explicit confirmed route-move API behavior remains supported.

#### Scenario: Publisher selection remains stable
- **WHEN** background refreshes finish while a Publisher or Slug edit is saving or its publication job is running
- **THEN** the latest Publisher, Slug and action remain visible without jumping to older response values

#### Scenario: Unpublish retains selected provider
- **WHEN** an Unpublish job completes and refreshes run
- **THEN** the panel updates the selected provider to Publish without selecting another provider

#### Scenario: Select another publisher
- **WHEN** the selected identity is unpublished and the developer chooses another installed Publisher
- **THEN** the panel saves that destination without a publisher operation, leaves other deployments untouched, restores the remembered Slug, and shows the selected provider's action

### Requirement: Conflict-safe publication persistence
A concurrent manifest update SHALL NOT open a settings-conflict dialog for Publisher or Slug editing. The panel SHALL rebase only the desired publication settings onto the authoritative manifest and retry while preserving unrelated changes. A confirmed live route move SHALL also retry against the current manifest.

#### Scenario: Concurrent publication settings save
- **WHEN** a Platform or other settings save updates the manifest before a Publisher or Slug edit is persisted
- **THEN** the panel reloads current settings, reapplies only the selected publisher and provider routes, retries with the current manifest version, and shows no settings-conflict dialog

#### Scenario: Concurrent confirmed route move
- **WHEN** a rebased Slug edit still requires route-move confirmation and the developer confirms it
- **THEN** the panel submits the confirmed route move against the latest manifest version without exposing a settings-conflict dialog

### Requirement: Immediate platform feedback
The panel SHALL update target-specific project controls immediately on every Platform selection, including while a previous Platform save is running. It SHALL serialize one save plus the latest queued choice rather than ignore rapid clicks.

#### Scenario: Switch platform
- **WHEN** the developer selects a different available Platform option
- **THEN** its active tab and corresponding Settings and Build controls appear immediately while the manifest update continues in the background

#### Scenario: Rapid platform switches
- **WHEN** the developer selects multiple Platform options before the first save finishes
- **THEN** every selected tab and its controls appear immediately, only one request runs at a time, and the latest choice is persisted after the active request

### Requirement: Conflict-safe platform persistence
Platform saves SHALL retain manifest conflict protection. A stale save SHALL rebase the latest Platform choice onto current authoritative settings without a settings-conflict dialog. A true failure SHALL clear queued intent and restore or reload authoritative project state.

#### Scenario: Concurrent Platform save
- **WHEN** a Publisher or other settings update changes the manifest before a Platform selection is persisted
- **THEN** the panel reloads current settings, reapplies only the latest Platform choice and package identity, retries with the current manifest version, preserves unrelated changes, and shows no settings-conflict dialog

#### Scenario: Platform save rejected
- **WHEN** the optimistic Platform manifest update fails validation, exhausts conflict retries or cannot be sent
- **THEN** the panel does not leave the unsaved platform controls presented as authoritative and reports or reloads the failure through its existing settings flow

### Requirement: Package setup action
When a selected packager reports missing prerequisites, the Build card SHALL show Setup in place of Build package. Setup SHALL open an installation dialog with live job output. After successful setup and a fresh ready status, the panel SHALL close the dialog and show Build package without starting it. Setup errors SHALL remain visible and retryable; status for a previously selected project or platform SHALL NOT repaint the current action.

#### Scenario: Tools missing
- **WHEN** the selected packager reports setup-required
- **THEN** the Build card shows Setup and does not launch the app build or package build

#### Scenario: Tools installed
- **WHEN** the developer clicks Setup and the installation job completes with all prerequisites present
- **THEN** the log dialog closes and the button changes to Build package, awaiting a separate click

#### Scenario: Install fails
- **WHEN** the installation job fails or readiness remains unavailable
- **THEN** the dialog keeps the error and logs visible, and the Build card continues to show Setup for retry

#### Scenario: Change platform during setup
- **WHEN** the developer selects another project or Platform while setup runs
- **THEN** setup continues in Jobs without blocking navigation, and only the relevant packager's Build card is updated

#### Scenario: External terms required
- **WHEN** the packager reports external terms that must be accepted before setup
- **THEN** the panel presents the terms link and asks for explicit consent before starting installation

### Requirement: Explicit workspace launch
The panel command line SHALL accept an explicit workspace path. The ordinary panel command and launcher SHALL use `XRB_HOME` when set, otherwise `%USERPROFILE%\.xrbuild`, on the ordinary default panel port. A separate repository-development command and launcher SHALL select the current checkout's `.xrbuild/` workspace and a distinct default panel port. A per-invocation port override SHALL take precedence over the default port for either mode.

#### Scenario: Ordinary launcher
- **WHEN** a user runs the ordinary launcher with no `XRB_HOME`
- **THEN** the panel opens the workspace at `%USERPROFILE%\.xrbuild` on the ordinary default port

#### Scenario: Repository-development launcher
- **WHEN** the maintainer runs the repository-development launcher from a checkout, with `XRB_HOME` naming a different folder
- **THEN** the panel opens that checkout's `.xrbuild/` on its separate default port and shows its path in the top bar

#### Scenario: Explicit path overrides environment
- **WHEN** the panel receives an explicit workspace path while `XRB_HOME` names a different folder
- **THEN** the panel uses the explicit path

#### Scenario: Both modes running
- **WHEN** a user-mode panel is already running on its default port and the maintainer starts the repository-development launcher
- **THEN** the developer panel starts on its distinct default port and neither instance changes the other's workspace

### Requirement: Opt-in repository shortcut
The Start-menu installer SHALL create one current-user shortcut, defaulting to an auto-routing launcher from the checkout where it runs. An explicit repository option SHALL force that shortcut to use the repository-development launcher, and an explicit user option SHALL force it to use the ordinary launcher. Reinstalling without an option SHALL restore auto routing. The installer SHALL NOT set a permanent workspace environment variable or change other users' shortcuts.

#### Scenario: Install the default shortcut
- **WHEN** a user runs the Start-menu installer without a mode option
- **THEN** its one shortcut launches the auto-routing panel and checks the selected user workspace directory at each launch

#### Scenario: Opt into the developer shortcut
- **WHEN** a developer runs the installer with its repository option from a checkout
- **THEN** their shortcut always launches that checkout's repository-development panel, even when `XRB_HOME` names another folder

#### Scenario: Restore ordinary shortcut
- **WHEN** a developer runs the installer with its user option
- **THEN** their shortcut launches the ordinary panel using `XRB_HOME` or the home default without changing other users' installations or workspace folders

### Requirement: Auto-routing Start shortcut
The auto-routing Start-menu launcher SHALL always select the user workspace named by `XRB_HOME`, else `%USERPROFILE%\.xrbuild`, on port 5180. A missing, empty or otherwise uninitialized selected directory SHALL display the normal Create your workspace setup, even when the current checkout contains an embedded `.xrbuild/`. Repository development SHALL remain available only through its explicit launcher or workspace argument. Top-level browser refreshes from an older auto-routed repository panel SHALL silently start or reuse the selected user panel and redirect there without mutating either server's workspace. The launcher SHALL NOT create or remove workspace folders before the user confirms setup.

#### Scenario: Absent user directory
- **WHEN** the selected user `.xrbuild` directory does not exist and the checkout contains its own `.xrbuild/`
- **THEN** the shortcut opens user mode on port 5180 and displays Create your workspace instead of repository projects

#### Scenario: Existing empty user directory
- **WHEN** the selected user `.xrbuild` directory exists but is empty or uninitialized
- **THEN** the shortcut displays Create your workspace and does not treat the checkout workspace as a fallback

#### Scenario: User environment precedence
- **WHEN** `XRB_HOME` names a missing, empty or initialized workspace
- **THEN** the shortcut selects that path in user mode and either displays setup or the initialized workspace as appropriate

#### Scenario: Home default
- **WHEN** `XRB_HOME` is unset and `%USERPROFILE%\.xrbuild` is initialized
- **THEN** the shortcut opens that ordinary user workspace

#### Scenario: No embedded workspace
- **WHEN** the selected user workspace directory and the checkout's embedded workspace are both absent
- **THEN** the shortcut opens the normal user setup flow on the selected user path

#### Scenario: Toggle without reinstalling
- **WHEN** the developer creates or removes the selected home workspace directory between shortcut launches
- **THEN** the next launch continues to select that user path and displays either its initialized workspace or setup flow without changing the installed shortcut

#### Scenario: Refresh an older repository auto-route
- **WHEN** an older auto-routed repository panel receives a top-level document refresh
- **THEN** it silently starts or reuses user mode on port 5180 and redirects the browser to the selected user workspace or setup flow

#### Scenario: Explicit repository launch remains fixed
- **WHEN** a panel was opened through the explicit repository launcher or workspace argument
- **THEN** that panel keeps its explicitly selected workspace and performs no auto-route redirect

#### Scenario: Running panel has another workspace
- **WHEN** port 5180 already serves a different workspace
- **THEN** auto routing refuses to open or change that running server; an explicit per-process port override remains available

### Requirement: Project package workspace
The panel SHALL install app dependencies from the selected project repository's package workspace before running an app script. The private development workspace MAY be the selected project repository and SHALL support its restored local projects without an external project checkout; when projects and integrations share that workspace, its lockfile MAY include both project and plugin importers. When the project repository differs from the integration workspace, its lockfile SHALL contain only app/project importers and plugin/packager importers SHALL remain in the integration workspace lockfile. A build receipt SHALL identify the canonical project path so a receipt from another checkout cannot validate the current build.

#### Scenario: Fresh public app checkout
- **WHEN** an explicitly selected project repository has no installed packages and the developer builds an app
- **THEN** the panel performs a frozen install there without switching publication source to another checkout

#### Scenario: Receipt from another checkout
- **WHEN** a project has the same ID and settings as one built in another project checkout
- **THEN** the other checkout's receipt does not make this checkout's build current

#### Scenario: Repository development workspace
- **WHEN** the maintainer opens the repository-development panel with no separate project-root override
- **THEN** its local apps and archived tests appear from the private development workspace and may be built and run there without a public site checkout

#### Scenario: Fresh selected project repository
- **WHEN** the selected project repository has no installed packages and the developer builds an app
- **THEN** the panel performs a frozen install in that repository root before running the app's build script

### Requirement: Panel freshness check
The panel SHALL record an identity for each running process and check whether any server code it loaded has changed since startup: the core's panel server sources and the folders of the workspace packagers and publishers it loaded. Panel UI files, read on every request, SHALL NOT count. When something changed, the top bar SHALL show a `restart available` chip naming the newest changed file, and the menu's Restart control panel item SHALL show the same dot as Rebuild host; both SHALL appear only while the panel is outdated. Restart recovery SHALL wait for a different panel identity at the configured origin rather than relying only on a process ID.

#### Scenario: Code changed after the panel started
- **WHEN** a pull or an edit changes a panel server source file or a loaded workspace publisher after the panel started
- **THEN** the top bar shows `restart available` naming that file, and Restart control panel shows a dot

#### Scenario: Restart loads the new code
- **WHEN** the developer chooses Restart control panel while it is outdated
- **THEN** the shared dialog remains only until a replacement panel identity is ready, the active document is replaced at the same route, and neither the dialog, chip nor dot remains

#### Scenario: Replacement reuses a process ID
- **WHEN** the replacement panel starts with the same operating-system process ID as the prior panel but a different startup identity
- **THEN** restart recovery recognizes the replacement and reloads the active interface automatically

#### Scenario: Restart does not recover
- **WHEN** no replacement panel identity answers within the bounded restart interval
- **THEN** the blocking progress state ends in a closable failure presentation that tells the developer how to retry

#### Scenario: Only the panel UI changed
- **WHEN** only a file under the panel's UI folder changed after the panel started
- **THEN** no restart is suggested; reloading the page shows the change

### Requirement: Workspace tool navigation
The panel SHALL show stable Control Panel and Plugins Manager navigation entries with configured workspace tools between them, followed by a separator, Restart and Rebuild. Plugins Manager SHALL use its own stable `/plugins/` route rather than panel page state. Concrete tool registrations SHALL come from the selected integration workspace, not hardcoded core paths or ports. An enabled plugin MAY provision bounded panel-managed entries through its plugin manifest; disabling that plugin SHALL remove its entries and start nothing. The existing optional workspace tool file MAY continue to register validated external loopback links or panel-managed tools. Plugin and workspace entries SHALL share one ID/path ownership validation, and plugin metadata SHALL NOT contain commands, arguments or credentials. Loading either form SHALL NOT start camera capture, a model worker, recording or a native camera service. When pinned package setup is required for managed tools, the panel SHALL complete its fixed frozen-lockfile setup before listening and opening the browser rather than during tool navigation.

#### Scenario: Configured tool
- **WHEN** an enabled integration-workspace plugin declares a valid managed panel tool and the developer follows its navigation entry
- **THEN** the panel loads the plugin-relative contained module once and opens its stable route on the panel origin without requiring a terminal command, separate fixed port or intermediate setup page

#### Scenario: Disabled plugin
- **WHEN** a plugin that declares a panel tool is disabled
- **THEN** its navigation entry is absent and neither its module nor any owned service starts

#### Scenario: Combined ownership collision
- **WHEN** enabled plugin tools or workspace tools repeat an ID or overlap routes/endpoints
- **THEN** navigation reports the invalid combined inventory and imports none of the conflicting modules

#### Scenario: Managed package setup after a pull
- **WHEN** the panel starts with configured managed tools and their pinned workspace package graph is missing or stale
- **THEN** the panel runs its fixed bounded frozen-lockfile setup before it listens or opens the browser, and later tool navigation runs no package installer

#### Scenario: External configured tool
- **WHEN** the integration workspace registers a valid external loopback tool
- **THEN** its plain-text label links to that validated destination, retains the originating panel as a validated return destination when configured, and starts no process

#### Scenario: Missing or invalid configuration
- **WHEN** tool configuration is absent or invalid
- **THEN** the standard panel stays usable, absent configuration adds no entries, and invalid configuration is reported rather than loading a module or creating an unsafe link

#### Scenario: Stable navigation
- **WHEN** the developer switches between projects, installed plugins and a configured tool
- **THEN** navigation labels stay fixed, the current page is identified and the menu supports keyboard and outside-click dismissal

### Requirement: Stable tool startup presentation
Control Panel, Plugins Manager and a registered tool SHALL use the shared XR Build design system and distinct `XR Build · Product Name` page identity before showing application content. Project/custom icons SHALL remain limited to app previews and native app windows. A managed tool's initial document request SHALL join its single-flight local web-runtime initialization and, on success, receive the application document directly without a separate panel-owned startup page. A terminal initialization failure SHALL remain readable and retryable. Shared application chrome, typography, cards, tabs, states, menus and dropdown/listbox behavior SHALL come from the same design-system components used by the panel rather than copied product styles or OS-rendered option popups. Waiting for camera availability SHALL NOT prevent revealing an initialized tool.

#### Scenario: Shared dropdown
- **WHEN** either the panel or tool displays a single-choice field
- **THEN** it uses the shared accessible dropdown/listbox presentation while the underlying application value and change behavior remain intact

#### Scenario: Managed cold start
- **WHEN** the developer opens a managed tool whose web runtime has not started
- **THEN** the document request shares one initialization attempt with concurrent requests and its first successful response is the tool application, not a Starting or setup document

#### Scenario: Startup failure
- **WHEN** the managed tool module cannot initialize or its dependencies are unavailable
- **THEN** the document request completes with a readable error and explicit retry action while Control Panel and Plugins Manager remain usable

#### Scenario: Cold reload
- **WHEN** application modules are slow to load in either light or dark mode
- **THEN** the browser keeps loading the requested application document, whose initial background matches the theme and whose uninitialized controls remain hidden without starting acquisition

### Requirement: Managed workspace tool lifecycle
A panel-managed workspace tool SHALL be loaded only from a canonical module path inside the selected integration workspace. Its configured route and any additional endpoint prefixes SHALL be local absolute paths that do not overlap another tool or reserved panel/API routes. The panel SHALL keep at most one active instance per tool, route only its declared requests to it, and invoke bounded cleanup when the panel restarts or exits. Tool configuration SHALL NOT contain or select a shell command.

#### Scenario: Contained module
- **WHEN** configuration names a module outside the workspace through traversal, an absolute path, a link escape or an unsupported file type
- **THEN** validation rejects it before import and the panel starts nothing

#### Scenario: Route collision
- **WHEN** a managed tool requests `/`, `/plugins/`, a panel API namespace, a maintenance route or a path already owned by another tool
- **THEN** validation rejects the registration and preserves the existing route

#### Scenario: One initialization
- **WHEN** multiple browser requests reach an inactive managed tool while it starts
- **THEN** they share one initialization attempt and no duplicate module instance, helper or listener is created

#### Scenario: Panel shutdown
- **WHEN** the panel restarts or exits with managed tools active
- **THEN** it asks every active tool to release its HTTP/upgrade listeners and owned local services within a bound, then continues panel shutdown

### Requirement: Managed tool authorization boundary
Opening or reloading a managed tool SHALL authorize only initialization of its local web runtime. Camera acquisition, model initialization, recording, native compilation and device-service creation SHALL remain outside navigation and behind the appropriate build/distribution or explicit user-action boundaries. Navigation, browser preloading and startup retries SHALL NOT count as capture, calibration or recording actions.

#### Scenario: Open tracking diagnostic
- **WHEN** the developer opens the managed Hand Tracking Input diagnostic and takes no capture action
- **THEN** the application document opens with zero camera streams, model workers, recordings, native builds and native camera services

#### Scenario: Explicit capture later
- **WHEN** the initialized tool's developer explicitly starts capture or calibration
- **THEN** its existing ownership, permission and cleanup rules apply using the prepared native runtime exactly as they do when the tool is launched directly

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

### Requirement: Viewport-filling application header
The shared application header background and bottom edge SHALL fill the complete visible viewport width on Control Panel and Plugins Manager routes whenever the document does not need vertical scrolling. The root document SHALL reserve no permanent scrollbar gutter; the browser's normal vertical scrollbar MAY appear only when content exceeds the viewport. The layout SHALL introduce no horizontal scrolling.

#### Scenario: Empty Plugins Manager fits the viewport
- **WHEN** the Plugins Manager content is shorter than the viewport
- **THEN** no right-side gutter or visible vertical scrollbar remains and the shared header reaches the viewport edge

#### Scenario: Control Panel content exceeds the viewport
- **WHEN** the Control Panel content is taller than the viewport
- **THEN** the page uses the browser's normal vertical scrolling without introducing a horizontal scrollbar

### Requirement: Empty user project workspace
When an initialized ordinary user workspace contains no live, archived or unregistered projects, the Control Panel SHALL make project creation the focused next action. It SHALL open the existing New project dialog once when entering that empty state and focus a `Project name` input. The dialog SHALL include the one-sentence description `Create a new app project in your workspace.` and present `Letters, digits, spaces, and dashes.` as helper text below the input, preserve the entered project name including its casing and spaces, and derive its lowercase folder name automatically by replacing each whitespace run with a dash. Project-folder uniqueness SHALL be case-insensitive; a colliding name SHALL validate while the creation dialog remains continuously open, mark the input invalid and replace the reserved helper line with `A project with this name already exists.` in red using the same size, weight and line height, instead of resizing, closing, flashing, reopening or opening a generic error dialog. The project sidebar SHALL show a non-interactive `Projects` heading without active-tab styling, a counter, Archive tab or search, followed by the shared `No project yet.` placeholder and `+ New project` action using the same shared design-system add-action component as non-empty project lists, with centered action text and standard stack spacing, including while the creation dialog is open. The Project and Activity regions SHALL render no heading, card, dock or placeholder. The dialog SHALL include Cancel and allow Escape dismissal; the same `+ New project` action SHALL remain available after dismissal. Dialogs opened after a project exists SHALL retain the same Cancel behavior. Repository-development workspaces and non-empty project inventories SHALL retain their existing layouts.

#### Scenario: Open an empty user workspace
- **WHEN** the Control Panel loads an initialized ordinary user workspace with no project inventory
- **THEN** the New project dialog opens with its one-sentence description, the `Project name` input focused and character guidance below it, the plain counter-free `Projects` heading, `No project yet.` placeholder and `+ New project` remain visible in the project sidebar behind the dialog, while the Project and Activity regions are blank

#### Scenario: Dismiss first-project creation
- **WHEN** the New project dialog opens while the project inventory is empty and the user chooses Cancel or presses Escape
- **THEN** the dialog closes, the plain counter-free `Projects` heading, `No project yet.` placeholder and `+ New project` remain available in the project sidebar, and the Project and Activity regions remain blank

#### Scenario: Later project creation is optional
- **WHEN** at least one project exists and the user opens New project from the sidebar
- **THEN** the dialog includes Cancel and can be dismissed without creating another project

#### Scenario: Create a project name with spaces
- **WHEN** the user enters `My Project` in the Project name field and creates it
- **THEN** the visible app name remains `My Project` while its package and project folder use `my-project`

#### Scenario: Case-insensitive duplicate name
- **WHEN** a project folder already exists and the user enters the same name with any letter casing
- **THEN** the creation dialog never closes, flashes or changes height, and the input retains its entered value and active blue focus outline while only `A project with this name already exists.` replaces the helper copy in red with identical typography

#### Scenario: Create the first project
- **WHEN** the user creates a valid project from the empty-workspace dialog
- **THEN** the normal project list, project content and activity layout return with the new project selected

#### Scenario: Empty repository-development workspace
- **WHEN** an explicit repository-development workspace has no projects
- **THEN** the panel does not automatically open the ordinary-user first-project flow

### Requirement: Project selection recovery
When the project inventory is non-empty but the remembered selected project is absent, stale or belongs to an empty inventory view, the Control Panel SHALL select an available project, switch to that project's live or archived view, persist the repaired selection and render its project details. It SHALL NOT show the retired `No projects yet` instructional card while any project exists. When no project is selected, the project-detail region SHALL remain blank instead of restoring that retired card.

#### Scenario: Stale remembered project
- **WHEN** the browser remembers a project ID that is not present and the workspace contains Hello XR
- **THEN** Hello XR becomes selected, its containing Projects view opens and its details render

#### Scenario: Empty remembered inventory view
- **WHEN** Archive is remembered but contains no projects while live projects exist
- **THEN** the Control Panel switches to Projects and selects the first available live project

#### Scenario: No selected project
- **WHEN** no project can be selected
- **THEN** the detail region remains blank and the retired `No projects yet` instructional card is not rendered

### Requirement: Focused project-list affordances
Project-list empty placeholders SHALL use the shared design-system empty-note component, including `Nothing is archived yet.` and `Drag projects here.`. Context menus SHALL omit actions that are unavailable in the current context instead of rendering disabled menu items. The Control Panel SHALL install only the shared design-system tooltip behavior, so one hovered or focused control produces at most one tooltip. Projects and Archive SHALL use the shared compact tab component and its animated selection indicator, including when panel rendering replaces the tab-list DOM. Opening search SHALL preserve the flat inline search field, vertically align its search icon with the closed-state search action, and animate the shared indicator from the selected tab across the search row; closing search SHALL animate it back.

#### Scenario: Empty project section
- **WHEN** a named project section contains no projects
- **THEN** `Drag projects here.` uses the same shared empty-note component as the empty Archive view

#### Scenario: Section action is unavailable
- **WHEN** a section cannot move up, move down or be deleted
- **THEN** that action is absent from its context menu rather than shown disabled

#### Scenario: Show a control hint
- **WHEN** a tooltip-enabled control is hovered or focused
- **THEN** exactly one shared design-system tooltip is shown

#### Scenario: Switch project inventory tabs
- **WHEN** the user switches between Projects and Archive
- **THEN** the shared selection line animates from the previous tab to the selected tab

#### Scenario: Open and close project search
- **WHEN** the user opens or closes project search
- **THEN** the search icon remains vertically aligned, the input remains flat and inline, and the shared selection line expands to the full search row or contracts back to the selected tab with a transition

#### Scenario: Drag a live project to Archive
- **WHEN** the user drags a non-running project from the Projects list over the Archive tab and drops it
- **THEN** the Archive tab shows the shared primary drop-target treatment, the project is archived, Archive opens and the moved project remains selected

#### Scenario: Drag an archived project to Projects
- **WHEN** the user drags an archived project over the Projects tab and drops it
- **THEN** the Projects tab shows the shared primary drop-target treatment, the project is unarchived into its remembered section, Projects opens and the moved project remains selected

#### Scenario: Drag a running project to Archive
- **WHEN** the user drags a running live project over the Archive tab
- **THEN** the tab does not accept or highlight the drop because archiving a running project is unavailable

### Requirement: Shared developer-tool components
Reusable Control Panel and workspace-tool visuals and interactions SHALL be owned by the shared design system. The Control Panel SHALL suppress the browser's native context menu throughout its document; only panel-owned contextual actions MAY open panel context menus. In addition to the existing shared components, the design system SHALL own named workspace layout primitives for standard desktop page insets, inter-column/section gaps and sidebar widths. Control Panel Apps, Plugins, Settings and workspace tools with comparable multi-column developer layouts SHALL consume those primitives while retaining their appropriate responsive topology. Product styles MAY position components and choose topology, but SHALL NOT duplicate shared layout rhythm, surface, typography, state, icon or interaction rules.

#### Scenario: Align comparable developer-tool pages
- **WHEN** the developer opens Apps, Plugins, Settings and the tracking diagnostic at the same desktop viewport width
- **THEN** their outer inset and inter-column rhythm use the same shared layout tokens, while each retains its own content and responsive behavior

#### Scenario: Render a repeated visual pattern
- **WHEN** the Control Panel or Hand Tracking tool needs a visual pattern already used by another developer tool
- **THEN** it uses the shared component or adds a design-system modifier variant rather than defining a product-owned copy

#### Scenario: Position a floating menu
- **WHEN** a context or navigation menu opens near a pointer or anchor
- **THEN** shared bounded floating-position behavior keeps it inside the viewport

#### Scenario: Render a shared icon
- **WHEN** a developer-tool control needs a standard icon
- **THEN** the icon is supplied by the shared icon library and no product-owned inline SVG is added

#### Scenario: Mark the current developer tool
- **WHEN** the product menu marks Control Panel or Plugins Manager as the current page
- **THEN** its checkmark uses the shared primary accent color

### Requirement: Shared modal surface
Every Control Panel modal SHALL use the shared design-system dialog surface. The dialog itself SHALL not receive a browser focus outline when opened or clicked; controls inside it SHALL retain their normal focus treatment.

#### Scenario: Open or click a modal
- **WHEN** any Control Panel modal opens or the user clicks its surface
- **THEN** no white or browser-default outline appears around the modal card

### Requirement: Copyable generic errors
A generic Control Panel failure SHALL show the stable description `XR Build could not complete this action. Review or copy the details below.` followed by the complete raw error in a fixed-height monospaced shared copy area that remains visibly multiline for short errors and scrolls for long errors. The block SHALL provide one standard transparent shared icon-button action that writes the complete error text to the clipboard and receives the normal shared icon hover/focus treatment. It SHALL reserve one status line below the log and show `Copied to clipboard.` there after a successful copy without changing the dialog height. Generic error dialogs SHALL use the shared corner Close control and SHALL NOT render a bottom OK/action row. Raw process output SHALL NOT be repeated as prose or expand as an unbounded paragraph. Job output and generic errors SHALL reuse the same copy-block visual component.

#### Scenario: Report a process failure
- **WHEN** a panel action fails with multiline process output
- **THEN** the dialog remains bounded, shows the stable generic description without duplicating the raw error, keeps the complete raw output in a scrollable log and provides a standard copy-error-details icon action

#### Scenario: Copy error details
- **WHEN** the user activates the copy action in a generic error dialog
- **THEN** the clipboard receives the complete raw error text rather than only the generic description, `Copied to clipboard.` appears in the reserved line below the log, and the dialog does not jump or resize

### Requirement: Generated user-workspace package bootstrap
An ordinary panel-created user workspace SHALL create and refresh its generated pnpm lockfile when its installed package graph is absent or stale. The panel SHALL fingerprint the workspace package manifests after a successful install so adding a project or changing dependencies invalidates readiness even when the old lock and virtual-store lock still match. A dependency-bearing workspace package SHALL also be considered stale when its package-local `node_modules` links are absent, including when a previously deleted project is recreated with the same path and manifest. Setup for this mutable user workspace MAY use `--no-frozen-lockfile`. Explicit project repositories and repository-development workspaces SHALL continue to require a committed current lockfile and SHALL use `--frozen-lockfile`.

#### Scenario: Run Hello XR in a new user workspace
- **WHEN** a newly created ordinary user workspace has Hello XR but no `pnpm-lock.yaml` or installed package graph
- **THEN** the panel initializes the lockfile, installs the workspace dependencies and continues the requested run instead of failing with `ERR_PNPM_NO_LOCKFILE`

#### Scenario: Add a project to an installed user workspace
- **WHEN** an ordinary user workspace has a current installed graph and the panel creates another project with package dependencies
- **THEN** the package-manifest fingerprint becomes stale and the next run refreshes the generated lock and dependency links before starting the dev server

#### Scenario: Recreate an identical deleted project
- **WHEN** the user deletes and recreates a project with the same path and dependency manifest but its package-local dependency links are absent
- **THEN** the panel refreshes the workspace install before starting the project instead of reusing the matching manifest fingerprint alone

#### Scenario: Reinstall a user workspace with a lock
- **WHEN** an ordinary user workspace already has `pnpm-lock.yaml` but its installed package graph or package-manifest fingerprint is absent or stale
- **THEN** the panel refreshes that mutable user-workspace graph without requiring the user to run pnpm manually

#### Scenario: Explicit repository has no lock
- **WHEN** an explicitly selected project repository has no `pnpm-lock.yaml`
- **THEN** the panel retains the frozen-install requirement and reports the missing lock rather than silently creating one

### Requirement: In-place rebuild progress
Host rebuild progress SHALL use one shared rebuild-progress component over the active Control Panel, Plugins Manager or registered tool route. The active interface SHALL remain visible behind the modal scrim. Every route SHALL show the same status header and icons, bounded streamed output, dialog dimensions, footer layout, persisted Autoclose option, View job action and Close action without a separate `XR Build` heading, opaque full-page setup backdrop, confirmation step or reduced route-specific presentation.

#### Scenario: Rebuild host in place
- **WHEN** the user chooses Rebuild from shared navigation
- **THEN** rebuild starts immediately and the shared component opens over the current interface while status and build output continue to update in the modal

#### Scenario: Same dialog in every section
- **WHEN** the developer starts Rebuild from Control Panel, Plugins Manager or a registered tool
- **THEN** each route renders the same rebuild component with the same structure, sizing, status states, log and footer controls

#### Scenario: Autoclose on success
- **WHEN** Autoclose on finish is enabled and the rebuild succeeds
- **THEN** the dialog closes on every route and the saved preference is used the next time Rebuild opens from any route

#### Scenario: Failure remains visible
- **WHEN** a rebuild fails while Autoclose on finish is enabled
- **THEN** the shared component remains open with the failed status, complete bounded output and the standard View job and Close actions

### Requirement: Empty Plugins Manager
When no workspace plugins are installed, the Plugins Manager SHALL render the `Plugins` title and divider using the shared compact title/tab component, followed only by a shared `No plugins installed yet.` empty state in the Plugins sidebar. It SHALL hide the complete Details region, including the Details heading and `Select a plugin.` placeholder. A non-empty plugin inventory SHALL retain the normal list and selected-plugin details.

#### Scenario: No installed plugins
- **WHEN** the Plugins Manager loads an empty plugin inventory
- **THEN** the Plugins sidebar shows the shared `Plugins` title divider and `No plugins installed yet.`, and no Details heading or selection placeholder is present

#### Scenario: Plugin becomes available
- **WHEN** at least one plugin is installed and the inventory reloads
- **THEN** the normal Details region returns for the selected plugin

### Requirement: Tool maintenance navigation is explicit authorization
Choosing Restart or Rebuild from shared navigation SHALL be the explicit authorization for that action. Registered tools SHALL execute the selected maintenance action in place without navigating to Control Panel or presenting a second confirmation. Consumed legacy maintenance parameters SHALL execute once and SHALL NOT repeat on refresh. Restart SHALL replace the active document only after a different panel startup identity is ready.

#### Scenario: Rebuild from a registered tool
- **WHEN** the developer chooses Rebuild while a registered tool is active
- **THEN** the current tool route remains visible behind a shared progress dialog, rebuild starts without a confirmation dialog, and live status and bounded output remain visible until completion or failure

#### Scenario: Restart from a registered tool
- **WHEN** the developer chooses Restart while a registered tool is active
- **THEN** the current tool route remains visible behind the shared restart dialog, the dialog closes when the replacement panel is ready, and the same tool route reloads automatically

#### Scenario: Legacy maintenance URL opened
- **WHEN** a maintenance navigation URL is opened
- **THEN** the requested action executes once after its parameter is removed and refreshing does not repeat it

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

### Requirement: Archived project package isolation

Workspace package discovery SHALL exclude `projects/archive/**` while retaining every live project section. Archiving
a package project SHALL NOT make the workspace lock stale or prevent the Control Panel from starting.

#### Scenario: Restart after archiving a package project

- **WHEN** the developer archives a project with package dependencies and restarts the Control Panel
- **THEN** workspace setup ignores the archived package importer and the panel starts without requiring a lockfile update

### Requirement: Shared field validation presentation
Control Panel text, number and custom-dropdown fields SHALL use the shared design-system field validation presentation. Invalid controls SHALL retain their normal surface and focus treatment rather than receiving a red-filled background. The helper line SHALL retain the same size, weight and line height as ordinary field description text while using the semantic error color, and product styles SHALL NOT duplicate this behavior.

#### Scenario: Input validation error
- **WHEN** a text or number field fails validation
- **THEN** the control is identified as invalid without replacing its normal surface or active focus outline, and its helper description is replaced by same-sized red error text

#### Scenario: Dropdown validation error
- **WHEN** a custom dropdown fails validation
- **THEN** the dropdown uses the same invalid-state and helper-text presentation as an input rather than a product-specific error style

### Requirement: Publisher root route
An empty normalized publication slug SHALL select the configured publisher route-prefix root. The panel SHALL preserve the intentional empty value, present the complete root URL, and authorize Publish and Unpublish through the same validation, ownership, confirmation and status rules as a named route. A publisher that stores named routes below the same prefix SHALL change only files owned by the root publication and SHALL preserve every child route.

#### Scenario: Publish without an app slug
- **WHEN** the developer clears App slug and publishes to a publisher whose prefix is `apps`
- **THEN** the app is published at the complete `/apps/` URL and the empty slug remains selected

#### Scenario: Root route coexists with named routes
- **WHEN** the publisher already contains named routes and the developer publishes, republishes or unpublishes the root route
- **THEN** only root-owned files change and every named route remains intact

#### Scenario: Root route collision
- **WHEN** root app output would replace a named route or unrelated file not owned by the same publication
- **THEN** publication is refused before push and the existing public tree remains unchanged

### Requirement: Queued publication operations
Valid Publish and confirmed Unpublish requests SHALL be represented as background jobs and executed one at a time in request order. A request received while another publication job executes SHALL remain visibly queued instead of failing only because publication work is active. Queued and running publication jobs SHALL pin their requested project, publisher, slug and operation, SHALL disable duplicate publication actions for that project, and SHALL remain observable after a page reload. The affected project's sidebar badge SHALL replace its remote publication state with the active local job state: queued SHALL use the same yellow treatment as queued Activity jobs, running SHALL use the same blue treatment and animated dot as running Activity jobs, and an idle published project SHALL use the same green treatment as completed Activity jobs. Existing safety conflicts with web or package work on the same project SHALL remain enforced.

#### Scenario: Two publication requests
- **WHEN** a developer requests publication work for a second app while another app's Publish or Unpublish job is running
- **THEN** the second request returns an accepted queued job, its project sidebar badge shows yellow `queued`, and it starts after the first operation ends

#### Scenario: Strict request order
- **WHEN** several Publish and Unpublish requests are accepted while publication work is active
- **THEN** at most one publication operation runs and queued operations start in their original request order, including after an earlier operation fails

#### Scenario: Running publication sidebar state
- **WHEN** a queued publication begins executing
- **THEN** its project sidebar badge changes to blue `running` with the shared animated status dot while Activity shows the same running state

#### Scenario: Publication completion sidebar state
- **WHEN** Publish succeeds, Unpublish succeeds, or either operation fails
- **THEN** the active job badge is removed in the completion update without waiting for remote publisher polling, and the sidebar shows green `published` only when the effective publication state remains published

#### Scenario: Queued job after reload
- **WHEN** the panel page reloads while a publication job is queued
- **THEN** Activity and the affected project's Build card restore its queued operation, the project sidebar restores its yellow `queued` badge, and Publisher, Slug and the publication action remain disabled

#### Scenario: Running job after reload
- **WHEN** the panel page reloads while a publication job is running
- **THEN** Activity, the Build card and the project sidebar restore that operation, including the blue running badge and animated dot

#### Scenario: Unsafe same-project work
- **WHEN** web or package work is running for a project, or that project already has queued publication work
- **THEN** the panel refuses a new operation that would race the same build output rather than allowing it to overtake the queue

#### Scenario: Queued Publish prepares current output
- **WHEN** a Publish job waits in the queue and later begins execution
- **THEN** it rebuilds or revalidates the app as needed, finalizes the current project icon as the browser favicon and calls the publisher only with the verified output

### Requirement: Explicit project rebuild

The project-row context menu SHALL offer **Rebuild** for a project with a valid manifest build script. Choosing it SHALL always execute that script as a background web-build job even when the recorded output is current, SHALL finalize and verify the resulting browser output and build receipt, and SHALL make the job visible in Activity. The action SHALL NOT run, package, publish or unpublish the project. Projects without a valid build script SHALL omit the action rather than show it disabled.

#### Scenario: Rebuild current app

- **WHEN** a project's recorded browser output is current and the developer chooses **Rebuild** from its row context menu
- **THEN** the manifest build script runs again, the successful output and receipt are refreshed, and the new background job is selected in Activity

#### Scenario: Rebuild archived app

- **WHEN** an archived project has a valid build script and the developer chooses **Rebuild**
- **THEN** it rebuilds in place without being unarchived, run, packaged or published

#### Scenario: Project cannot rebuild

- **WHEN** a project has a broken manifest or no build script
- **THEN** its context menu contains no **Rebuild** action

#### Scenario: Rebuild fails

- **WHEN** the explicit app rebuild script fails or its output cannot be verified
- **THEN** the Activity job fails with its bounded build output and no successful receipt is advanced

### Requirement: Plugin-contributed global settings

The panel SHALL use the global Settings page as the configuration surface for installed plugin runtime settings and
plugin-owned tool/app preferences. A plugin SHALL declare settings through a bounded metadata schema rendered with
panel-owned controls; plugins SHALL NOT inject arbitrary settings markup or scripts. Runtime-provider values and
plugin-owned panel/tool values SHALL be stored separately under the plugin identity, and only runtime-provider values
SHALL be applied to native provider configuration. Plugin Manager SHALL continue to own enablement, metadata and
samples but SHALL NOT render plugin settings.

The contribution schema SHALL support bounded text, number, boolean and select fields with labels, defaults, hints,
optional numeric limits and optional section grouping. Invalid schemas or values SHALL be rejected without making
other Settings cards unavailable. Installed disabled plugins SHALL retain their values and remain identifiable in
Settings, while editing remains unavailable until the plugin is enabled.

Settings SHALL provide a left-side contribution filter headed **Module**. **All** SHALL show every available core and
plugin setting. **Apps** SHALL appear only while at least one core-owned setting exists and SHALL show only core-owned
settings. Each plugin that exposes settings SHALL have one filter item that shows only that plugin's contribution.
Plugins without settings SHALL not appear in the filter. The **Module** heading and module column SHALL remain sticky,
with the module list scrolling internally only when it exceeds the available viewport height. Every displayed owner
SHALL have a sticky, full-width outside-card heading using **Apps** when core settings exist or the plugin title; owner
names and general plugin descriptions SHALL not be repeated inside Settings cards. A plugin MAY declare one bounded
Settings-specific description for its contributed controls. At desktop widths the content SHALL use the same bounded
middle column as Plugin Manager and leave the remaining right column empty. The app bar SHALL paint above sticky owner
headings, and sticky owner headings SHALL occlude scrolled controls instead of allowing segmented tabs or inputs to
overlap either header. Within a plugin card, subsequent declared sections SHALL use a shared design-system divider
with equal token-based spacing on both sides, boolean fields SHALL stack as full rows, and shared helper copy below
controls SHALL use lower emphasis than field labels and values. The core project surface SHALL be labelled **Apps**
and Plugin Manager SHALL be labelled **Plugins** in navigation and page chrome. Plugins SHALL show a Settings shortcut
beside the folder action only when the selected plugin contributes settings. Plugin metadata MAY declare one bounded
`glyph` character when no PNG icon is available. PNG icons SHALL take precedence; declared glyphs and the fallback
puzzle SHALL automatically use the shared light/dark theme tint, including matching favicons.

#### Scenario: Filter all settings

- **WHEN** the developer selects All in the Settings sidebar
- **THEN** the content column shows every available core contribution followed by every installed plugin contribution

#### Scenario: Filter one settings owner

- **WHEN** the developer selects an available Apps filter or a contributing plugin in the Settings sidebar
- **THEN** the content column shows only cards owned by that selection

#### Scenario: No core settings remain

- **WHEN** the core contributes no Settings cards and Settings opens with a stale `module=control-panel` selection
- **THEN** the Apps filter is omitted and navigation normalizes to All while plugin contributions remain available

#### Scenario: Plugin without settings

- **WHEN** an installed plugin declares no runtime or panel/tool settings
- **THEN** it does not appear in the Settings sidebar

#### Scenario: Runtime settings appear globally

- **WHEN** an installed plugin declares native runtime settings
- **THEN** Settings shows those controls in that plugin's card and Plugin Manager does not duplicate them

#### Scenario: Plugin tool preferences appear globally

- **WHEN** a plugin declares panel/tool preference fields
- **THEN** Settings shows generic design-system controls for them without executing plugin-provided UI

#### Scenario: Runtime and tool values remain separate

- **WHEN** the developer saves both runtime-provider fields and plugin-owned tool fields
- **THEN** the panel stores both under the plugin identity but adds only runtime-provider values to app provider configuration

#### Scenario: Managed tool reads effective preferences

- **WHEN** a plugin-owned managed tool starts or reloads
- **THEN** it can read its validated effective runtime and panel/tool values from a same-origin panel API

#### Scenario: Disabled plugin contribution

- **WHEN** an installed plugin with saved settings is disabled
- **THEN** Settings preserves and identifies its contribution without allowing edits until the plugin is enabled

#### Scenario: Module headings remain outside cards

- **WHEN** Settings shows core or plugin contributions
- **THEN** the left filter is headed **Module**, and each displayed owner is titled above its card without duplicating the owner name inside the card

#### Scenario: Settings controls scroll under the heading

- **WHEN** a long Settings page scrolls a segmented control or input beneath a sticky module heading
- **THEN** the heading's opaque layer hides the control, and the app bar hides the heading at the top boundary, instead of allowing layers to overlap

#### Scenario: Module navigation stays available

- **WHEN** Settings content is taller than the viewport but the module list fits
- **THEN** the module column stays in place without scrolling its list

#### Scenario: Plugin Manager links to contributed settings

- **WHEN** the selected plugin contributes runtime or panel settings
- **THEN** Plugin Manager shows a Settings icon beside its folder icon that opens that plugin's Settings filter

#### Scenario: Plugin declares a glyph

- **WHEN** an installed plugin without a PNG icon declares one valid glyph character
- **THEN** Plugins and Settings show that glyph using the current theme tint, and a PNG still takes precedence when both are present

#### Scenario: Contributed sections remain distinct

- **WHEN** a plugin card contains multiple declared sections
- **THEN** each section after the first begins below a full-width divider

#### Scenario: Boolean settings scan vertically

- **WHEN** a contribution contains multiple boolean fields
- **THEN** each checkbox occupies its own full row rather than sharing a two-column row

#### Scenario: Field help has lower emphasis

- **WHEN** a field includes descriptive help below its control
- **THEN** the shared component renders that copy smaller and lower-contrast than the field label and current value

#### Scenario: Invalid contribution

- **WHEN** plugin metadata declares unsupported controls, duplicate keys, invalid limits or excessive settings
- **THEN** the panel reports invalid plugin metadata and continues rendering other global settings

#### Scenario: Diagnostic tool uses global settings

- **WHEN** the hand-tracking diagnostic tool is opened from the panel
- **THEN** processor, threshold and recording preferences come from its plugin's global settings and no separate Settings tab is shown in the tool

### Requirement: Camera-aware app build context

Before running an app's build or dev script, the panel SHALL resolve the project's effective distribution choice and
workspace camera policy and provide that bounded context to the app toolchain. Successful build receipts SHALL record
the resolved context. A build whose recorded camera policy differs from current global Settings SHALL be stale and
SHALL be rebuilt by the existing automatic Run, package or publication flow before its output is consumed. Direct app
builds without panel context SHALL default to Perspective.

#### Scenario: Desktop browser build

- **WHEN** a project on Desktop is built while Desktop is configured Orthographic
- **THEN** its app toolchain receives the Orthographic policy and the successful receipt records it

#### Scenario: Immersive distribution build

- **WHEN** a project on WebXR or an installed immersive platform is built with its default policy
- **THEN** its app toolchain receives Perspective

#### Scenario: Global policy changed after build

- **WHEN** an app was built with Perspective and the developer changes its current distribution choice to Orthographic
- **THEN** the next Run, package or publication action rebuilds the app before using its output

#### Scenario: Project manifest unaffected

- **WHEN** the developer changes any global camera policy
- **THEN** no project's `xrb-project.json` is rewritten

#### Scenario: Direct terminal build

- **WHEN** a template-based app is built outside the panel without camera-policy environment values
- **THEN** it builds with Perspective rather than failing or selecting Orthographic implicitly

### Requirement: Package version actions
The package version input SHALL offer a shared bounded context menu when its pending value is a valid three-component numeric version. The menu SHALL provide Patch, Minor and Major actions. Patch SHALL increment the patch component, Minor SHALL increment the minor component and reset patch to zero, and Major SHALL increment the major component and reset minor and patch to zero. An action SHALL update only the pending input; it SHALL NOT save the manifest or change package history before the developer requests Build. Invalid or incomplete versions SHALL not offer version-increment actions.

#### Scenario: Increment patch
- **WHEN** the developer right-clicks pending package version `2.4.7` and chooses Patch
- **THEN** the input becomes `2.4.8` and no manifest write or package build occurs

#### Scenario: Increment minor
- **WHEN** the developer right-clicks pending package version `2.4.7` and chooses Minor
- **THEN** the input becomes `2.5.0` and remains pending until Build

#### Scenario: Increment major
- **WHEN** the developer right-clicks pending package version `2.4.7` and chooses Major
- **THEN** the input becomes `3.0.0` and remains pending until Build

#### Scenario: Invalid pending version
- **WHEN** the package version input contains an incomplete or invalid value
- **THEN** its context menu exposes no version-increment action

### Requirement: Detailed Apps identity and balanced Activity action
Settings Apps and the Apps favicon SHALL share the same emoji and theme-consistent tint that preserves internal detail. The favicon SHALL update its tint when the theme changes. The Activity clear glyph SHALL have the same optical edge inset as the leading tab label without reducing its clickable area.

#### Scenario: Settings Apps icon
- **WHEN** Settings is rendered in either theme
- **THEN** the Apps glyph remains recognizable rather than becoming a solid silhouette

#### Scenario: Activity header
- **WHEN** Jobs or Log is selected at supported narrow or wide widths
- **THEN** the clear glyph and leading tab text have balanced edge spacing and filters do not overlap

### Requirement: Finalized card metadata
When the panel finalizes a browser build it SHALL stamp the launcher card metadata into the page: whether the icon is the generated default with its colour and shape, whether the build ships a 3D icon, and the manifest description as the page description unless the app authored one. The panel SHALL also send the same publication card (name, description, icon settings) with every publish and activation so a publisher serves it in its inventory, and SHALL expose that card in the project API. Launchers SHALL prefer the inventory card and fall back to the page metadata of pages published before cards existed, so a published card renders exactly like the local preview card without rebuilding the app, and SHALL show no filler description when none exists.

#### Scenario: Published card matches the local card
- **WHEN** a project with the generated default icon and no description is published and listed by a launcher
- **THEN** the launcher renders the same compact sphere in the manifest colour and no description, as it does for the local preview

#### Scenario: Authored description wins
- **WHEN** an app's page already declares its own description
- **THEN** finalization keeps it and does not stamp the manifest copy

### Requirement: Independent publication version controls
Release-capable publishers SHALL expose a Next version field and shared Patch/Minor/Major actions, separate from package version and verified Live version. Versions SHALL be stable three-part semantic versions scoped to publisher plus publication identity. Drafts SHALL survive refresh and publisher selection changes without deploying.

#### Scenario: Suggested next version
- **WHEN** a destination needs a default next version
- **THEN** the panel suggests `0.1.0` without semantic history, otherwise the next patch after the highest retained version, including after a rollback

#### Scenario: Version bump
- **WHEN** a developer invokes Patch, Minor or Major on a valid draft version
- **THEN** the draft changes using the shared version increment rules without publishing, switching live version or editing package identity/version

#### Scenario: Successful or failed update
- **WHEN** a new release finishes successfully or fails
- **THEN** success suggests the next patch while failure preserves the requested draft for correction or retry, and only verified status identifies the live release

#### Scenario: Invalid version or stale history
- **WHEN** the requested version is malformed, collides with different retained bytes or relies on an outdated decision revision
- **THEN** API validation prevents mutation and the UI shows an actionable error without a generic settings-conflict dialog

#### Scenario: Publisher has no release support
- **WHEN** the selected publisher lacks versioned-release capability
- **THEN** the panel retains its legacy publication workflow without fake version controls or history

### Requirement: Publication release history and live selection
The Live version field SHALL be a shared dropdown listing the selected destination's retained releases newest first with version or Legacy label and creation time, marking and selecting the verified live release; every retained entry SHALL be reachable there, and without history the field SHALL be a read-only label. Choosing another retained release SHALL only inspect it: the identity-row open link then targets the publisher's archive of that exact output (when the publisher provides one), and the action row offers Activate, which deploys that retained version after the shared confirmation identifying destination and current/requested release, and Delete, a red secondary action that removes that retained release and its archive after a destructive confirmation naming the version and destination. Delete SHALL be unavailable for the live release (never inspected) and disabled for the requested deployment; choosing the live release again ends the inspection. Controls SHALL support keyboard use, narrow/wide layouts and both themes. Refresh/reconnect SHALL NOT overwrite newer selections or label unverified intent Live.

#### Scenario: Select a previous release
- **WHEN** the developer chooses a retained release in Live version, presses Activate and confirms
- **THEN** the panel starts activation without rebuilding current source, keeps the canonical route and package settings, and updates the Live marker only after verification

#### Scenario: Cancel selection
- **WHEN** the developer chooses a retained release in Live version and only opens it or cancels its Activate or Delete
- **THEN** no deployment, manifest change, history change or live-release change occurs

#### Scenario: Delete a retained release
- **WHEN** the developer chooses a retained release that is not live, presses Delete and confirms
- **THEN** the panel starts a deletion job that removes only that release from the publisher's history, shows Deleting… meanwhile, ends the inspection when it completes and leaves the live version and route unchanged

#### Scenario: Legacy deployment
- **WHEN** a current deployment has no semantic release version
- **THEN** it is labeled Legacy (unversioned), not an invented version, and an explicit first update preserves a selectable legacy snapshot

#### Scenario: Unpublished with history
- **WHEN** the app is unpublished but retains release history
- **THEN** Live version reads Not live with no marked release and keeps every retained entry available to open, to Activate after confirmation and to Delete after confirmation

#### Scenario: Stale asynchronous response
- **WHEN** an earlier status/history response arrives after a newer selection or verified operation result
- **THEN** it cannot revert that selection, restore a stale spinner or falsely change the Live marker

### Requirement: Pre-import core dependency bootstrap

The existing user, development and auto shortcut entry points SHALL reach a dependency-free bootstrap before the panel's external module imports. It SHALL preserve the selected core, workspace, project repository, port and launcher mode. If no matching responsive panel can be reused and required public core dependencies are missing or unusable, it SHALL automatically repair only that selected core's public package graph with its pinned package manager, a frozen lockfile and lifecycle scripts disabled, showing progress before repair work starts. It SHALL verify installed readiness and unchanged manifest/workspace/lock inputs before launching the panel. It SHALL NOT install private/user project graphs, rewrite tracked dependency declarations/locks, enable lifecycle hooks, install global/native/model tooling or treat an old stamp as proof of readiness. Existing workspace/managed-tool setup policies SHALL remain separate and unchanged.

#### Scenario: Missing dependency after a pull

- **WHEN** a shortcut starts a core checkout whose required runtime dependency is not installed and no correct running panel is reused
- **THEN** the bootstrap opens setup progress, installs that core's locked public dependencies and starts the requested panel only after readiness verification succeeds

#### Scenario: Dependency fails before the panel logger exists

- **WHEN** the main panel would fail during static imports because a required package is missing
- **THEN** bootstrap diagnostics remain available without importing that panel module, and the failure does not disappear with the hidden launch process

#### Scenario: Already ready

- **WHEN** the selected core's required dependencies are usable and no setup is required
- **THEN** the launcher starts or opens the correct panel without invoking package installation or flashing a setup modal

#### Scenario: Existing matching panel

- **WHEN** a responsive panel matches the requested application, core, workspace and project repository on the selected port
- **THEN** the shortcut may open it without starting a second server or changing dependencies underneath it, and it does not force a restart

#### Scenario: Stale readiness stamp or broken dependency link

- **WHEN** prior setup metadata exists but actual dependency resolution/version compatibility fails
- **THEN** the bootstrap does not accept the stamp as success and enters visible repair or an actionable blocked state

#### Scenario: Frozen installation cannot proceed

- **WHEN** dependency installation fails because the lock does not match, network is unavailable or the installation directory is not writable
- **THEN** the bootstrap retains a visible reason and output, leaves tracked input files unchanged, launches no panel for that failed attempt and offers an explicit retry without non-frozen or script-enabled fallback

#### Scenario: Required runtime or manager is unavailable

- **WHEN** the launcher lacks a supported runtime or cannot use the repository-pinned package manager through available tooling
- **THEN** it gives precise prerequisite instructions and a diagnostic location through the startup UI or a native fallback without silently downloading global toolchains or substituting an unpinned manager

#### Scenario: User workspace owns separate packages

- **WHEN** the selected user/development workspace contains its own packages, private data or embedded service state
- **THEN** core bootstrap does not discover/install that graph, activate services or modify those sources/settings, and existing later workspace setup policy remains responsible for them

### Requirement: Visible shortcut setup and verified handoff

A shortcut repair SHALL present a build-free startup page with a modal following the panel's rebuild progress styling, system theme and accessible status conventions. It SHALL show checking, installing and starting states with bounded plain-text live output rather than fabricated percentages or a hidden terminal. Installer and early server errors SHALL remain readable with an explicit reason, owned sanitized diagnostic log and user-initiated Retry, Copy log and Close actions. Success SHALL navigate the setup page into the verified selected panel in the same tab only after readiness and panel identity are confirmed. Refresh/reconnect SHALL NOT restart work, and setup UI teardown SHALL NOT terminate the accepted panel.

#### Scenario: Progress before installation

- **WHEN** missing dependencies require a potentially long install
- **THEN** a visible setup modal explains the operation and streams sanitized output before the repair proceeds, with no browser alert/confirm/prompt or terminal window

#### Scenario: Install succeeds but the server fails

- **WHEN** package installation succeeds but the panel exits, cannot import or reports a startup collision
- **THEN** setup remains failed with server diagnostics and does not announce a ready application or redirect to an unrelated listener

#### Scenario: User retries a failed setup

- **WHEN** the user chooses Retry after a failure
- **THEN** the bootstrap rechecks readiness, input snapshot and setup ownership before beginning one new bounded attempt and preserves diagnostics without an automatic retry loop

#### Scenario: Successful startup

- **WHEN** setup has succeeded and the requested panel answers with the expected core/workspace/projects identity
- **THEN** the current setup tab navigates into that panel without a second application tab, and the server continues running after bootstrap teardown

#### Scenario: Close or reload during setup

- **WHEN** the user tries to dismiss active progress or closes/reloads the browser tab
- **THEN** the UI explains active work where it can, its owner does not orphan or force-kill the installer, and reopening the same shortcut reattaches without starting another install

#### Scenario: Browser cannot show progress

- **WHEN** startup cannot open its progress page
- **THEN** an actionable native fallback gives the failure/log location rather than leaving an invisible long-running repair

#### Scenario: Output contains markup or credentials

- **WHEN** captured output contains markup, terminal codes or sensitive authentication values
- **THEN** the UI renders sanitized bounded text without executing markup or exposing those credential values in display, copied output or persisted logs

### Requirement: Isolated concurrent bootstrap sessions

Core setup SHALL have one verifiable installation owner per canonical checkout and retain each caller's requested launch selection. Duplicate requests for the same target SHALL attach to the current progress instead of spawning competing installers. Different targets SHALL serialize/share core installation without being redirected to each other's workspace. The temporary server SHALL bind only to loopback, allowlist its routes/assets and validate Host, mutation Origin and a per-session capability. It SHALL NOT provide arbitrary filesystem/shell access, delete unverified stale locks, terminate unrelated processes or certify dependency inputs that changed during the attempt.

#### Scenario: Shortcut clicked twice

- **WHEN** the user invokes the same shortcut repeatedly while setup runs
- **THEN** the requests share the same owned progress and one installer, followed by no duplicate panel for the selected target

#### Scenario: User and development shortcuts overlap

- **WHEN** ordinary and development shortcuts request setup for the same core concurrently
- **THEN** core dependency writes are serialized and each caller retains its correct workspace/projects/port destination

#### Scenario: Checkout changes while setup runs

- **WHEN** core manifests, workspace declaration or lock bytes change during installation
- **THEN** the bootstrap rejects readiness for that stale snapshot and asks for an explicit retry rather than launching against unverified inputs

#### Scenario: Unknown coordination owner

- **WHEN** the installation rendezvous or lock is owned by an unverified process or ambiguous record
- **THEN** bootstrap reports the blocked state without deleting the record, killing the process or beginning another installer

#### Scenario: Foreign bootstrap request

- **WHEN** a request has a foreign Host/Origin, lacks the session capability or asks for an unallowlisted route/action
- **THEN** bootstrap refuses it without starting work, running commands or exposing arbitrary core/workspace files

### Requirement: Unified embedded project workflow
The Apps UI SHALL render embedded and ordinary projects through the same compact project card and capability-based Develop, Publish and Build workflows. Embedded origin SHALL NOT replace the normal workflow with a separate read-only screen, separate mandatory project sections or a required Copy to workspace form. Embedded rows SHALL support normal context-menu actions, section drag/drop, ordering, archive and unarchive. Delete SHALL be unavailable for embedded entries with an understandable explanation, backed by server enforcement. Ordinary missing capability, active-use, configuration and validation constraints SHALL apply equally to both origins. Shared design-system geometry and controls SHALL be used for both.

#### Scenario: Embedded app detail
- **WHEN** the user selects a valid embedded app
- **THEN** its card uses the normal compact identity row and workflow tabs, with actions enabled according to normal project capabilities instead of an embedded-only restriction

#### Scenario: Build and publish from the normal card
- **WHEN** the user configures a supported packager or publisher for an embedded app and starts the action
- **THEN** the normal settings, jobs, action-state and result UI are used without requesting an independent project copy

#### Scenario: Normal controls and durable edits
- **WHEN** the user edits an embedded app's platform, provider, name or icon through normal controls and reloads the panel
- **THEN** the saved effective choices remain visible and usable without changes to installed defaults

#### Scenario: Embedded context menu and drag/drop
- **WHEN** the user opens an embedded row menu or drags it within/between sections or between Projects and Archive
- **THEN** normal supported actions are offered and organization changes persist, with only Delete unavailable because of embedded origin

#### Scenario: Kind and capability restrictions
- **WHEN** either an ordinary or embedded project lacks a development script, packageable kind, compatible packager, configured publisher or required signing tools
- **THEN** the UI explains the same ordinary capability/configuration restriction rather than promising unconditional execution or requiring a copy based on origin

#### Scenario: Publication slug defaults
- **WHEN** a project without a saved publication slug is opened in Publish
- **THEN** its suggested slug uses the unqualified project folder without internal origin or archive prefixes, while explicitly saved and deployed slugs remain authoritative

#### Scenario: Layout parity
- **WHEN** equivalent embedded and ordinary apps are viewed at desktop and narrow viewport sizes
- **THEN** their tabs, identity rows, fields and primary actions follow the same shared compact geometry without the former tall embedded-only form

### Requirement: Simplified project context menu
The project-row context menu SHALL NOT offer Review build cache, and the Apps UI SHALL NOT expose its build-cache review modal. Delete SHALL be hidden for embedded projects in Projects and Archive rather than shown disabled. Ordinary idle project deletion and existing active-use restrictions SHALL remain unchanged. Switching between project menus SHALL NOT retain embedded-only disabled state or tooltips.

#### Scenario: Embedded project menu
- **WHEN** the user opens the context menu for an embedded project in Projects or Archive
- **THEN** neither Review build cache nor Delete is offered, and other supported actions retain their normal behavior

#### Scenario: Ordinary project after embedded project
- **WHEN** the user opens an idle ordinary project's menu after opening an embedded project's menu
- **THEN** Delete is visible and enabled under its ordinary rules, without an embedded deletion tooltip, and Review build cache remains absent

#### Scenario: Running project menu
- **WHEN** the user opens the context menu for a running project
- **THEN** Delete remains hidden under the existing active-use restriction

### Requirement: UI simplification preserves backend safeguards
Removing project cache-review controls SHALL NOT remove cache-maintenance APIs, initiate cleanup or relax preservation checks. Server-side embedded deletion refusal SHALL remain authoritative and explanatory.

#### Scenario: Backend safety remains enforced
- **WHEN** a client directly requests embedded project deletion or cache maintenance
- **THEN** embedded deletion is refused with its existing explanation, and cache maintenance retains explicit review, confirmation and all preservation checks
