## MODIFIED Requirements

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
