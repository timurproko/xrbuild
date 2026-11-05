## REMOVED Requirements

### Requirement: Panel remote publication
**Reason**: Remote public-source cards replaced the intended per-local-project Publish controls and do not represent local drafts or builds.
**Migration**: Show all restored local projects in their normal sections and archives. Use only the selected local WebXR app's Build card for publication.

### Requirement: Authenticated workflow publication job
**Reason**: Dispatching a public-source build is not a publication of the selected local project.
**Migration**: Keep authenticated workflow correlation and safe status in the private production publisher's local-build publication job.

## MODIFIED Requirements

### Requirement: WebXR publication settings
The Build card SHALL offer publisher selection, slug and one state-appropriate publication action only for a selected local app project on the standalone WebXR platform choice. Selecting a publisher configures publication without a separate enable control. These settings SHALL save independently from Platform, package identity and native settings and SHALL show the selected publisher's resulting URL. Publishing SHALL operate on the selected local project's validated build, never a different public-source project with the same name. Draft and archived test projects SHALL NOT be uploaded or published implicitly.

#### Scenario: Configure publication
- **WHEN** a developer selects an available publisher and valid slug for a local WebXR app
- **THEN** the panel saves its stable publication identity without changing platform or package identity

#### Scenario: Native or headset package platform
- **WHEN** a developer selects a native app or headset package platform
- **THEN** publication controls are hidden while saved publication settings remain dormant

#### Scenario: Package before publication
- **WHEN** a developer packages an app before publishing its configured WebXR route
- **THEN** the package uses the canonical route without triggering publication

#### Scenario: Publisher unavailable
- **WHEN** a manifest names a disabled or missing publisher
- **THEN** the saved selection remains readable but Publish is unavailable

#### Scenario: Publish one selected local app
- **WHEN** a developer chooses Publish for a configured local WebXR app while other projects and archived tests exist
- **THEN** the panel builds and publishes only that app's verified output, leaves every other project local, and shows the verified public route

#### Scenario: Not eligible
- **WHEN** a local test project, unconfigured draft or app on a native/package platform is selected
- **THEN** the panel offers no production Publish action for it

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
