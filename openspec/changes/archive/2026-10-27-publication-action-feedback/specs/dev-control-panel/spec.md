# Spec Delta

## MODIFIED Requirements

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

### Requirement: Publication status in the Build card
The panel SHALL show the selected URL, every deployed URL, the pending operation, last safe error and diagnostic link when available. A failed request SHALL NOT appear deployed. Reloading the panel SHALL query publishers rather than treating local intent as deployment success.

#### Scenario: Publication pending
- **WHEN** a publisher reports an operation still running
- **THEN** the Build card shows the pending operation and diagnostic link

#### Scenario: Publication failed
- **WHEN** a publisher reports failure
- **THEN** the Build card shows the error and does not present the requested route as successfully deployed

#### Scenario: Panel restarted
- **WHEN** the panel restarts after a publication request
- **THEN** it reloads status from the selected publisher

#### Scenario: Published action
- **WHEN** the selected route is published
- **THEN** the Build card shows a full Unpublish button in the same action slot and style used by Publish, keeps Publisher enabled, makes Slug read-only and visibly muted without an error, and gives every published destination row no separate trash action

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

## ADDED Requirements

### Requirement: Publication action controls
Publish and Unpublish SHALL share one compact action slot. During a local publication job, the action, Publisher and Slug controls SHALL be disabled and visibly muted; the action SHALL retain its dimensions, show only a centered spinner and keep an accessible operation name. When published and idle, Publisher SHALL remain enabled and Slug SHALL be read-only without stale validation errors. Publication jobs SHALL NOT block the rest of the panel.

#### Scenario: Publish in progress
- **WHEN** a Publish job is running for the selected project
- **THEN** its publication action retains its normal size, replaces Publish with a centered spinner, retains Publishing… as its accessible name, visibly mutes and locks Publisher and Slug, refuses a duplicate click, and does not block navigation, other settings or activity views

#### Scenario: Unpublish in progress
- **WHEN** an Unpublish job is running for the selected project after confirmation
- **THEN** the same publication action retains its normal size, replaces Unpublish with a centered spinner, retains Unpublishing… as its accessible name, visibly mutes and locks Publisher and Slug, refuses a duplicate click, and does not open a progress modal

#### Scenario: Publication field error alignment
- **WHEN** a validation error adds content below one publication field
- **THEN** both field titles remain top-aligned and the action remains aligned with the input row rather than the error bottom

### Requirement: Published deployment list
Every publisher with preloaded published status SHALL appear below the controls as its own row, titled by its displayed HTTPS hostname with the complete deployed URL as its link. All live rows SHALL remain visible when Publisher changes, and the action SHALL manage only the selected destination. Rows SHALL omit a separate history title, relative-age badge and row action.

#### Scenario: Multiple published destinations
- **WHEN** an app is live on more than one Publisher
- **THEN** the Build card shows one block per live deployment, each titled with its publisher hostname and followed by its complete linked URL, regardless of which Publisher is selected

### Requirement: Immediate publication completion
After a successful publication job, the panel SHALL immediately update the selected action and animate its deployment row expanding for Publish or collapsing to nothing for Unpublish while publisher status converges. The animation SHALL respect reduced-motion preferences.

#### Scenario: Published deployment appears
- **WHEN** a Publish job completes successfully before publisher status has converged
- **THEN** the spinner stops, the action immediately becomes Unpublish, and the provider block expands and fades into the deployment list while status refresh continues in the background

#### Scenario: Unpublished deployment disappears
- **WHEN** an Unpublish job completes successfully before publisher status has converged
- **THEN** the spinner stops, the action immediately becomes Publish, and the affected provider block visibly collapses and fades to nothing while other deployment blocks remain

### Requirement: Independent publication destinations
Changing Publisher SHALL select another deployment destination without moving or removing an existing deployment. The panel SHALL restore each publisher's slug and status. While a publication save or job runs, refreshes SHALL retain the latest user selection and the action SHALL NOT target an older persisted provider. Publication completion SHALL never select another provider automatically.

#### Scenario: Publisher selection remains stable
- **WHEN** background status or project refreshes finish while a Publisher or Slug edit is saving or its publication job is running
- **THEN** the latest selected Publisher, Slug and action state remain visible without jumping to values from an older response

#### Scenario: Unpublish retains selected provider
- **WHEN** an Unpublish job completes and project or status refreshes run
- **THEN** the panel updates the selected provider to Publish and removes its row without selecting any other provider

#### Scenario: Select another publisher
- **WHEN** the selected identity is published and the developer chooses another installed Publisher
- **THEN** the panel saves that destination without confirmation or a publisher operation, leaves the previous deployment live, restores the selected publisher's remembered Slug, and immediately shows Publish or Unpublish from that publisher's preloaded status

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
