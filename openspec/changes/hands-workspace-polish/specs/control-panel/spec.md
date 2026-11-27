# Spec Delta

## MODIFIED Requirements

### Requirement: Passive remote updates share maintenance indicators

The panel SHALL check the core and selected workspace origin default branches at startup and every five minutes while idle, without fetching, pulling or changing repository files. Newly advertised commits SHALL show a short `update` header label and an Update menu dot in an update colour distinct from restart and rebuild. Clicking either Update control SHALL invoke the same explicit Update action.

#### Scenario: Either repository has a new remote tip

- **WHEN** a successful lightweight query advertises a default-branch commit not present locally in either repository
- **THEN** the header shows `update` in the maintenance-label position and the Update menu entry shows its dot, both in the update colour

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

### Requirement: Hands input display label

The Apps Input dropdown SHALL display Hands for the existing hand-input option. Its summary SHALL say Hands when Hands is the only choice and count several choices, naming any chosen option that is unavailable. Its stored value SHALL remain `hand`; existing app settings and provider resolution SHALL remain compatible.

#### Scenario: Existing app uses hand input
- **WHEN** an app whose settings include `hand` opens in Apps
- **THEN** the dropdown option says Hands, the summary says Hands or counts it among several choices, and selecting it still saves `hand`

#### Scenario: Hand provider unavailable
- **WHEN** Apps retains a hand-input selection without an available provider
- **THEN** the option and summary name Hands with the existing unavailable indication rather than changing the saved value or silently removing it

## ADDED Requirements

### Requirement: Short maintenance labels

Header maintenance labels SHALL read `restart`, `rebuild` and `update`, each in its own colour, with the full reason available on hover. Progress dialog logs SHALL keep one fixed height while output streams in.

#### Scenario: Rebuild required

- **WHEN** the host must be rebuilt
- **THEN** the header shows `rebuild` and its hover text names why

### Requirement: Restart waits for rebuilding work

Restart SHALL be refused while desktop setup, Rebuild or Update runs, because stopping them would leave build locks behind. Requests refused or unreachable while the panel restarts SHALL NOT be reported as errors.

#### Scenario: Restart during Rebuild

- **WHEN** the person requests Restart while Rebuild runs
- **THEN** the panel asks to wait for Rebuild to finish and leaves the rebuild running

#### Scenario: Requests during a restart

- **WHEN** a page request is refused with the restarting response or cannot reach the restarting panel
- **THEN** no error dialog, Retry or Failed status appears and the page reloads when the panel returns
