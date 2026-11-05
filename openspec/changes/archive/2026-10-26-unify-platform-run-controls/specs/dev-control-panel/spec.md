# Spec Delta

## MODIFIED Requirements

### Requirement: Project settings
Settings SHALL show one connected, scrollable Platform control for Desktop, WebXR and plugins, with an accessible active choice and no tooltips. Display/Input and Display options SHALL align; Dev server stays in Settings. Build SHALL put web Build first, then a responsive package title/version/action row and other fields; no duplicate Platform. A Platform save SHALL update `target` and `platform` atomically; unrelated edits SHALL keep both, even if disabled. Old manifests SHALL work.

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

### Requirement: Build target
The app's manifest SHALL continue to store `target` as `host` (or omit it, the native default) or `webxr`. The Settings card SHALL infer the displayed target from its single Platform choice; it SHALL NOT show a second Target or Runs on control. A packager SHALL be available only when its declared target matches the project's target.

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
- **WHEN** a developer clicks Run on a built WebXR project
- **THEN** its preview opens in a browser tab, no host run is requested, and the panel does not report native host status for that tab

#### Scenario: Browser build absent
- **WHEN** a WebXR project's build output lacks an index page
- **THEN** Run is disabled with a Build-first explanation

#### Scenario: Run the native project
- **WHEN** a developer clicks Run on a native project
- **THEN** the panel starts the host and shows Stop while it is running, as before

#### Scenario: Package for the headset
- **WHEN** the developer clicks Build package on a WebXR project with a matching packager selected
- **THEN** the package is written to the workspace's `builds/` without a host build, and the panel shows its path and size
