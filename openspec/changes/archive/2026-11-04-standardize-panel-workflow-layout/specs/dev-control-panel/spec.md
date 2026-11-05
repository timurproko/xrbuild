## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Project settings
The selected project SHALL show `Develop`, `Publish`, and `Build` workflow tabs inside its project card using the same full-width underlined navigation-tab treatment as the Activity card's `Log` and `Jobs` tabs; the selected tab SHALL NOT have a filled or white active treatment. Develop SHALL show only local Desktop and Browser preview choices, with Run/Stop and Dev server, Fullscreen and 2D controls as applicable. Build SHALL show only distributable choices with package identity/version/history and Build actions. Publish SHALL show publisher/slug fields and Publish or Unpublish actions independently of the selected package target. The card's project icon SHALL align to the top of its identity row and remain with the project title. Folder then Open JSON SHALL be right-aligned beside the primary action below the identity row; Publish SHALL have Open JSON only, and the published route SHALL be right-aligned in the workflow-tab row. The page SHALL show no separate project-workflow column label. Runtime controls SHALL appear only on Develop, package controls only on Build, and publication controls only on Publish. The active workflow surface SHALL persist while switching projects, and each surface SHALL remember its last platform choice per project. The remaining project settings, persistence, compatibility, responsive behavior and availability rules remain as specified.

#### Scenario: Card-local project workflow
- **WHEN** the developer selects a project
- **THEN** its project card contains full-width underlined Develop, Publish, and Build tabs matching Jobs and Log, no separate project-workflow heading appears above it, and switching tabs retains the specified preview/distribution separation

#### Scenario: Aligned project identity actions
- **WHEN** a project has a published route
- **THEN** its icon and title share the identity row, Folder immediately precedes Open JSON at the primary action row's right edge (JSON only on Publish), and the URL is right-aligned in the workflow-tab row

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
- **THEN** Display and Input use two equal columns, while Package title/version use the same wider-first ratio as Publisher/App slug, and all pairs stack at the shared narrow breakpoint


#### Scenario: Sticky project action
- **WHEN** the developer scrolls the selected project's hero action above the app bar
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
