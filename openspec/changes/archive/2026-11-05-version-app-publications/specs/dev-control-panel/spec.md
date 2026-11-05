## MODIFIED Requirements

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

## ADDED Requirements

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
