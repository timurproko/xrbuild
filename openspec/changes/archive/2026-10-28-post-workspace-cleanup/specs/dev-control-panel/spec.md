## MODIFIED Requirements

### Requirement: Project list
The left column SHALL list the projects in sections the developer manages. Sections SHALL be the section folders of the workspace's `projects/`, always lower case: a section named with capitals is saved lower case and its folder renamed to match, and headings show names in capitals; `xrb-panel.json` in the workspace keeps only their order, the order of projects and where archived projects came from. Each row SHALL show the project's icon, name, last web build time and version, and a status dot while it launches (blue) or runs (green). The list scrolls on its own, independent of the page.

#### Scenario: Own sections
- **WHEN** the developer creates a section "Demos" and drags hello-cube into it
- **THEN** hello-cube's folder moves to `projects/Demos/hello-cube`, and the list shows it there after a reload

#### Scenario: Manage sections
- **WHEN** the developer renames a section (double-click, or Rename in its right-click menu), reorders sections, drags a project within or between sections, or deletes a section (Delete section in its right-click menu; the heading has no delete button)
- **THEN** the folders follow: a renamed section's folder is renamed with everything in it (no second section appears), the projects of a deleted section move to `projects/Unsorted/` and its other files (a README) go to the Recycle Bin, so the section does not come back

#### Scenario: Project in no section
- **WHEN** a project is in `projects/Unsorted/`
- **THEN** it is shown in an "Unsorted" section at the end of the list

#### Scenario: Right-click menu
- **WHEN** the developer right-clicks a project row
- **THEN** a menu offers Rename, Archive and Delete, and no row colour

#### Scenario: Colour
- **WHEN** `xrb-panel.json` still holds a row colour for rig-check from an older panel
- **THEN** the rig-check row shows no colour bar, like every other row

### Requirement: Project icon
Every project SHALL have one icon: a PNG named in its manifest, or the default icon when none is named. For an app it is the window and taskbar icon of the running app, transparency kept, and the source of the package thumbnail, whose format the platform's packager decides. The panel SHALL show each project's icon on black in the list and in the project view, and pass it to the host when running the project. When the project's build has a 3D icon (`icon.js`), the panel SHALL report its preview URL with the project.

#### Scenario: Custom icon
- **WHEN** the developer sets `icon.png` as the icon of globe and builds a package
- **THEN** the panel shows that image for the project, the package's thumbnail is made from it, and the running app's window shows it, transparent, in the taskbar

#### Scenario: No icon set
- **WHEN** a project's manifest names no icon
- **THEN** the panel shows the default icon for it with a "default icon" tag, and the package and the running app use the default icon

#### Scenario: Not a PNG
- **WHEN** the developer chooses an icon file that is not a PNG
- **THEN** the panel refuses to save it and says the icon must be a PNG

#### Scenario: 3D icon reported
- **WHEN** hello-cube's build holds `icon.js`
- **THEN** the project list gives hello-cube's icon model as `/preview/hello-cube/icon.js`, and a project without one has no model

### Requirement: Icon studio
Right-clicking a project's icon SHALL open its icon menu (a click does nothing): the default sphere's colours (while the project has no icon of its own), Upload image… (the dialog: choose a PNG, frame part of it, Take), Render 3D… (only when the build has a 3D icon) and Remove icon (only when the project has its own icon; the project then shows the default sphere). Render 3D… SHALL open the icon studio: a modal that previews the app's 3D icon alone (Render preview), without loading the app, at 512 x 512 on a checkered background showing transparency, with the current thumbnail (the icon on black) beside it, Take, Reset and a help line naming the controls. The icon holds still: left-drag turns it, middle-drag pans it, right-drag or scroll zooms it and Reset restores the starting view. Take, Reset and the help line show disabled until the icon has loaded. Take SHALL save the current frame as the project's icon PNG and update the thumbnail.

#### Scenario: Open the studio
- **WHEN** the developer chooses Render 3D… for globe
- **THEN** the studio shows a spinner while the icon loads, then the live preview and the thumbnail side by side, and an × in the corner closes it

#### Scenario: Pause an animation
- **WHEN** the developer renders the launcher's rocket, whose icon animates in launchers
- **THEN** the studio shows it holding still and offers no Pause

#### Scenario: Page without the SDK
- **WHEN** the developer opens the menu of rig-check, a plain page without a build or `icon.js`
- **THEN** the menu offers Upload image… and no Render 3D…

#### Scenario: Icon menu
- **WHEN** the developer right-clicks globe's icon while it shows the default sphere
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
The project settings card SHALL show one connected, scrollable platform control for Desktop, WebXR and plugins. It SHALL omit separate Settings and Platform titles, keep the run options (Fullscreen, or 2D for a 3D display) in the platform row with Dev server and Open JSON, and list Display and Input below it. A platform save SHALL update `target` and `platform` atomically; unrelated edits SHALL keep both. Each platform tab SHALL keep its own Display, Input and run options (`platformSettings` in the manifest; Fullscreen, 2D and Dev server in the panel), restored when the tab is chosen again. Old manifests SHALL work.

#### Scenario: Change the title
- **WHEN** the developer changes an app's title and presses Enter
- **THEN** the manifest's name and platform title are updated without changing its package ID

#### Scenario: Saving without a button
- **WHEN** the developer changes a dropdown or commits a title edit
- **THEN** the changed setting is saved without a Save button; Open JSON offers direct access to the manifest

#### Scenario: Fixed identity field
- **WHEN** the platform's packager declares an identity field fixed after packaging
- **THEN** that field is shown read-only to avoid creating a separate app on the platform

#### Scenario: Empty title
- **WHEN** the developer clears the title
- **THEN** the panel does not save and says the title is required

#### Scenario: Package version entry
- **WHEN** the developer types a package version without requesting Build package
- **THEN** the version is not saved yet

#### Scenario: Choose a platform button
- **WHEN** the developer selects a different Platform button
- **THEN** that button becomes active and the target and platform save together without a second control or Save button

#### Scenario: Native standalone
- **WHEN** an app manifest has no target or platform and the developer opens Settings
- **THEN** Platform shows Desktop, with Display and Input available and no package action

#### Scenario: Browser standalone
- **WHEN** the manifest has target `webxr` but no platform
- **THEN** Platform shows WebXR, hides native Display and Input, and offers no package action

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
