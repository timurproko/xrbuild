# Spec Delta

## ADDED Requirements

### Requirement: Module navigation paints its shell independently

Switching among Apps, Hands, Calibration, Plugins, Settings and developer-only Design SHALL show the shared header and destination page frame without waiting for slow data requests or remote fonts. Loading or unavailable content SHALL remain contained within that visible shell.

#### Scenario: Delayed module data

- **WHEN** a person follows a module menu link while its content request is delayed
- **THEN** the header and destination frame remain visible and usable instead of displaying an empty page

#### Scenario: Font service unavailable

- **WHEN** remote fonts are slow or unavailable during module navigation
- **THEN** the module shell paints with fallback fonts without a font-readiness visibility gate

### Requirement: Passive remote updates share maintenance indicators

The panel SHALL check the core and selected workspace origin default branches at startup and every five minutes while idle, without fetching, pulling or changing repository files. Newly advertised commits SHALL show an update available header label and menu dot matching existing maintenance styling. Clicking either Update control SHALL invoke the same explicit Update action.

#### Scenario: Either repository has a new remote tip

- **WHEN** a successful lightweight query advertises a default-branch commit not present locally in either repository
- **THEN** the header shows update available in the maintenance-label position and the Update menu entry shows its dot

#### Scenario: Workspace settings change locally

- **WHEN** local project or preference files change without a new remote default-branch commit
- **THEN** those file changes neither produce nor suppress the remote-update indication

#### Scenario: Background job active

- **WHEN** startup or a periodic check becomes due while any job is queued or running
- **THEN** no remote check starts until the panel is idle and no background remote query overlaps a newly started job

#### Scenario: Remote unavailable

- **WHEN** a remote query times out, fails authentication or cannot connect
- **THEN** it ends silently without prompting, fetching, altering files or blocking the page and does not claim a successful fresh check

#### Scenario: No new remote commit

- **WHEN** the remote default-branch tip is already contained in local history or both roles resolve to the same checkout
- **THEN** existing local commits do not cause a false update indication and the identical checkout is queried only once per check

### Requirement: App settings saves do not move primary actions

App settings SHALL persist in the background without showing saving text or moving the Run action. A failed save SHALL show short accessible error feedback outside layout that positions Run, while retaining the existing safe retry and ordering behavior.

#### Scenario: Save pending or successful

- **WHEN** Display, Input or platform options change and a save is pending or succeeds
- **THEN** no saving message appears and the Run action stays at its previous vertical position

#### Scenario: Save fails

- **WHEN** a settings write fails
- **THEN** a short error is visible and accessible without shifting Run, and unsafe stale settings are not silently used

### Requirement: Maintenance progress logs support copying

Every shared log-bearing maintenance progress dialog SHALL offer the existing Jobs-style Copy job log button at the log box's top right, in running, successful and failed states. Copy SHALL use the complete currently available job log rather than only the visible tail.

#### Scenario: Running or failed maintenance

- **WHEN** a Rebuild, Update or prerequisite progress dialog displays output during work or after failure
- **THEN** its top-right copy action copies all available log lines with the existing clipboard feedback behavior

#### Scenario: Job cannot start or clipboard unavailable

- **WHEN** no job was created or clipboard access fails
- **THEN** copying handles the available diagnostic text or clipboard failure without closing the dialog or hiding its failure information
