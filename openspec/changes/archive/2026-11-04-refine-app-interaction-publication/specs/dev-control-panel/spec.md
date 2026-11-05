## MODIFIED Requirements

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

### Requirement: Publication status in the Build card
The panel SHALL use the selected publisher's effective status consistently for the deployment URL, pending operation, action and destination fields. It SHALL show the last safe error and diagnostic link when available. A failed request SHALL NOT appear deployed. A failed-but-deployed record SHALL remain removable with Unpublish. Reloading SHALL query publishers rather than treating local intent as deployment success.

#### Scenario: Publication pending
- **WHEN** a publisher reports an operation still running
- **THEN** Publish shows the pending operation and diagnostic link

#### Scenario: Publication failed
- **WHEN** a publisher reports failure
- **THEN** Publish shows the error and does not present the requested route as successfully deployed

#### Scenario: Panel restarted
- **WHEN** the panel restarts after a publication request
- **THEN** it reloads status from the selected publisher

#### Scenario: Published action
- **WHEN** the selected route is published or failed-but-deployed
- **THEN** Publish shows Unpublish in the shared action slot, disables Publisher, makes Slug read-only, and retains the deployed slug even when a native package target is selected

#### Scenario: Published URL hover
- **WHEN** the pointer is elsewhere in the publication row but not over the URL text
- **THEN** the URL does not receive its link hover treatment

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

### Requirement: Publication action controls
Publish and Unpublish SHALL share one compact action slot. During local publication work or status checks, destination editing SHALL be disabled. During a job the action SHALL retain its dimensions, show only a centered spinner and keep an accessible operation name. When published and idle, Publisher SHALL be disabled and Slug SHALL be read-only without stale validation errors. Publication jobs SHALL NOT block the rest of the panel. A late HTTP start response SHALL NOT regress a newer completed job to queued/running.

#### Scenario: Publish in progress
- **WHEN** a Publish job is running for the selected project
- **THEN** its action retains its size, shows a centered spinner with Publishing… as its accessible name, locks Publisher and Slug, refuses duplicate clicks, and does not block navigation or Activity

#### Scenario: Unpublish in progress
- **WHEN** an Unpublish job is running after confirmation
- **THEN** the same action retains its size, shows a centered spinner with Unpublishing… as its accessible name, locks Publisher and Slug, refuses duplicate clicks, and does not open a progress modal

#### Scenario: Publication field error alignment
- **WHEN** a validation error adds content below one publication field
- **THEN** both field titles remain top-aligned and the action remains aligned with the input row rather than the error bottom

#### Scenario: Fast operation completes before HTTP response
- **WHEN** a completed job event arrives before the operation's initial HTTP response
- **THEN** the terminal state and corresponding Publish/Unpublish action remain visible without a stuck spinner

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

## ADDED Requirements

### Requirement: Detailed Apps identity and balanced Activity action
Settings Apps and the Apps favicon SHALL share the same emoji and theme-consistent tint that preserves internal detail. The favicon SHALL update its tint when the theme changes. The Activity clear glyph SHALL have the same optical edge inset as the leading tab label without reducing its clickable area.

#### Scenario: Settings Apps icon
- **WHEN** Settings is rendered in either theme
- **THEN** the Apps glyph remains recognizable rather than becoming a solid silhouette

#### Scenario: Activity header
- **WHEN** Jobs or Log is selected at supported narrow or wide widths
- **THEN** the clear glyph and leading tab text have balanced edge spacing and filters do not overlap
