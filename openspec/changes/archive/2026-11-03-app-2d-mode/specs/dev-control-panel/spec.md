# Spec Delta

## MODIFIED Requirements

### Requirement: Project settings

The project-column title SHALL become separate Display and Build tabs using the shared navigation-tab design, with one
project card below them. Display SHALL show only local preview choices (Desktop and standalone WebXR), with Run/Stop in
the hero and Dev server, Fullscreen and 2D in the platform row, followed by Display plus Input for both preview choices, and
with Open JSON immediately before the hero's folder action on both surfaces. Build SHALL show only distributable choices (standalone WebXR when a publisher is available and package
targets), with package identity/version/history or publisher/slug fields and the target's Build, Publish or Unpublish
action in the hero. Display and Input SHALL use two equal columns at regular widths. Package title/version SHALL use
the same primary/secondary column ratio as Publisher/App slug. A published route SHALL appear once as a hero URL link
and SHALL NOT be repeated as a green deployment result block. Runtime controls SHALL NOT appear on Build, and package or publication controls SHALL
NOT appear on Display. The active Display/Build surface SHALL persist while switching projects, and each surface SHALL
remember its last platform choice per project. Display SHALL provide a
Refresh displays context-menu command that reruns monitor discovery. If the saved desktop monitor is no longer present,
refresh SHALL select and save the available primary/first monitor and SHALL hide the stale Missing monitor choice. A
packaged headset tab SHALL be build-only and omit Run, Dev server, Fullscreen and 2D. A
platform save SHALL update `target` and `platform` atomically; unrelated edits SHALL keep both. Each platform tab SHALL
keep its own Display and Input choices in manifest `platformSettings`, while Dev server, Fullscreen and 2D SHALL each
be remembered once per project in panel-local storage and remain synchronized between Desktop and standalone WebXR. Switching surface or
platform tabs SHALL animate to the new natural content height without retaining an older minimum-height gap. When the
hero action scrolls away, the sticky app bar SHALL place a compact fixed-width matching action immediately after the selected app
name, using `...` for its starting/stopping state so Run, pending and Stop do not shift the header. The optional `description` in `xrb-project.json` SHALL provide local launcher card copy; an empty or absent value SHALL show no generic filler text. Old manifests and saved run options SHALL work.

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
- **WHEN** the developer opens JSON from the icon immediately before the folder action on either surface
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
- **THEN** Platform shows WebXR, offers monitor-only Display and Input choices for the local browser preview, and offers no package action

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
- **THEN** Open JSON remains immediately before the hero's folder action on both surfaces

#### Scenario: Display and Build separate intent
- **WHEN** the developer changes between the Display and Build surfaces in the project-column title
- **THEN** Display shows only Desktop/WebXR preview controls in one project card, while Build shows only package/publication controls and distributable targets in that card, and the card expands or collapses smoothly

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

### Requirement: Run on the display

The panel SHALL start `xrb-host` for a native project in one of two modes, chosen with the app-level Dev server
checkbox (remembered per project): built, from the project's entry folder; or dev server, for projects with a dev
script, the project's dev server with live reload, which the panel starts and stops with the host. For standalone
WebXR, built mode SHALL open the panel preview route and dev mode SHALL start and own the same project dev server
without a native host. The panel SHALL own the preview browser process in both modes and retain the current projection
behind a random route/token-scoped read-only loopback endpoint until that run stops. It SHALL launch a normal browser
window on the selected monitor when Fullscreen is off, or a separate browser window that enters fullscreen automatically
on that monitor when Fullscreen is on, without an in-page confirmation button. For both native Desktop and standalone
WebXR, after Run is clicked the action SHALL immediately become a disabled Launching state until startup completes, then
become Stop; after Stop is clicked it SHALL become disabled Stopping until teardown completes. Stop SHALL close the owned
browser window and its preview dev server when present. Only one managed host or browser preview runs at a time. The native host SHALL run with the project's provider selections and plugin
settings, load the workspace's plugins and start with the selected local 2D camera/view mode. Test projects SHALL run
like apps.

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

## REMOVED Requirements

### Requirement: Global camera settings

**Reason:** Camera projection becomes a local per-project/per-Platform 2D run mode that updates managed apps live;
workspace-global build policy is no longer the product model.

**Migration:** Existing panel-local 2D values remain in use. `xrb-settings.json` camera overrides are ignored/removed,
and the next verification of a build receipt containing the old camera context requires one normal rebuild.
