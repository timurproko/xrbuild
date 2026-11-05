## ADDED Requirements

### Requirement: Separate project repository
The panel SHALL accept an explicit project repository root independently from the selected integration workspace.
`--projects=<path>` SHALL take precedence over `XRB_PROJECTS_HOME`; when neither is present the project root SHALL
default to the selected workspace for backward compatibility. The project root SHALL own `projects/`,
`xrb-panel.json`, app package-workspace files and generated editor configuration. The integration workspace SHALL
continue to own plugins, integration dependencies, package output and machine-local state. The panel SHALL report
both resolved roots and SHALL NOT require either repository to be nested inside the other.

#### Scenario: Sibling public app checkout
- **WHEN** the panel starts with a private integration workspace and an explicit sibling project repository
- **THEN** it lists and edits projects from the sibling checkout while loading plugins and package output from the private workspace

#### Scenario: Backward-compatible workspace
- **WHEN** no explicit project root or `XRB_PROJECTS_HOME` is set
- **THEN** the selected workspace remains both the project root and integration workspace

#### Scenario: Explicit path wins
- **WHEN** `XRB_PROJECTS_HOME` names one checkout and `--projects=<path>` names another
- **THEN** the explicit argument is the project root and the panel reports that choice

## MODIFIED Requirements

### Requirement: Embedded workspace versioning
The embedded integration workspace SHALL be tracked by the repository's root Git history and SHALL NOT contain
nested Git metadata. Its plugin source, manifests, locks and pinned third-party dependencies SHALL be tracked, with
binary dependencies stored through Git LFS. When a separate project repository is selected, project source, project
layout and app package metadata SHALL be versioned only by that repository and SHALL NOT be duplicated in the
embedded workspace. Credentials, signing material, installed packages, compiled plugin output and generated builds
SHALL remain ignored.

#### Scenario: Import an existing workspace
- **WHEN** the maintainer imports integration files into `.xrbuild/` and selects a separate project repository
- **THEN** root Git tracks the private plugin source and LFS pointers but no nested repository or app source

#### Scenario: Private integrations with public projects
- **WHEN** repository development selects `<repo>/.xrbuild/` as the integration workspace and a sibling checkout as the project repository
- **THEN** root Git tracks the private plugins but no app source, while the sibling repository tracks the projects and app package metadata

#### Scenario: Build the embedded workspace
- **WHEN** projects from a separate project repository use plugins from the embedded integration workspace
- **THEN** installed packages, compiled binaries and generated output do not appear as tracked changes in either repository; pinned LFS dependencies remain tracked privately

#### Scenario: Fresh clone with LFS
- **WHEN** a maintainer clones the private repository with Git LFS and separately clones the project repository
- **THEN** private pinned integration files materialize under `.xrbuild/third_party/` and the project checkout contains no private dependency objects

### Requirement: Local catalog in an embedded project preview
When the panel serves a launcher project's browser preview, the launcher SHALL list available apps from that panel's
selected project repository, without requiring the production publication inventory. A published launcher SHALL
continue to read its configured publication inventory.

#### Scenario: Production inventory is unavailable during local preview
- **WHEN** a local browser preview opens while the production inventory is missing
- **THEN** its cards show eligible apps from the selected project repository and launch through local panel preview routes

#### Scenario: Published catalog
- **WHEN** the launcher runs at its published origin
- **THEN** it lists routes from the publisher-owned inventory and does not use the development panel API
