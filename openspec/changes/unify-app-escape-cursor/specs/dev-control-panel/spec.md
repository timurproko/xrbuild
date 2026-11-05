## ADDED Requirements

### Requirement: Unified Activity header

The Activity card SHALL place Jobs/Log tabs at the left, the active tab's filters centered, and its X clear action at the right in one header row. The content area SHALL contain only items, item details, or empty states. Moving controls SHALL preserve saved tab/filter state, filter counts, accessibility, and existing clear semantics. The header SHALL remain usable without overlap at supported narrow widths.

#### Scenario: Jobs selected
- **WHEN** Jobs is the active Activity tab
- **THEN** job-status filters appear in the header center and the existing clear-finished-jobs action appears at the right when applicable, with no tools row inside the job list

#### Scenario: Log selected
- **WHEN** Log is the active Activity tab
- **THEN** log-level and applicable debug filters appear in the header center and the existing clear-log action appears at the right when applicable, with no tools row inside the log content

#### Scenario: Switch or reload
- **WHEN** the user switches tabs or reloads the panel
- **THEN** Jobs remains before Log, saved selection and filters remain intact, and X acts only on the selected tab's existing clear operation without closing Activity or stopping running jobs

#### Scenario: Compact header and keyboard access
- **WHEN** the Activity card is narrow or filters have large counts
- **THEN** tabs, filters, and X remain on one header row without overlapping, overflowing filters remain reachable, and only the tab buttons participate in the tablist's arrow-key navigation

### Requirement: Global Apps cursor preference

Settings SHALL provide Apps > Cursor: System, Ring, or Ring with hover dot (default), using shared controls. The validated workspace preference SHALL apply on subsequent Desktop/Browser built/dev launches without a rebuild, with next-run guidance. It SHALL NOT enable Mouse or alter deployed packages. Invalid writes SHALL be rejected; absent or unrecognized legacy values SHALL use the default.

#### Scenario: Settings navigation
- **WHEN** Settings opens with All or Apps selected
- **THEN** the core Cursor setting is visible under Apps with the same shared controls and spacing as other Settings contributions

#### Scenario: Persist and launch
- **WHEN** the user saves Ring, reloads Settings, and launches an app through Desktop or Browser in built or dev mode
- **THEN** Ring remains selected and the launched SDK app receives Ring without a rebuild

#### Scenario: Disabled Mouse wins
- **WHEN** a launch configuration excludes Mouse and a cursor style is saved
- **THEN** that style does not enable mouse interaction or app-surface mouse feedback

#### Scenario: Invalid preference
- **WHEN** an unsupported cursor value is submitted
- **THEN** the save is rejected and other workspace preferences are unchanged

#### Scenario: Legacy workspace
- **WHEN** a workspace has no saved cursor preference or an unrecognized legacy value
- **THEN** Settings and new launches use Ring with hover dot without modifying unrelated preferences

### Requirement: Scoped fullscreen browser session closure

The panel SHALL allow the current page of a managed fullscreen browser preview to request closure of only its owned session after the shared shell resolves Escape as close. Requests SHALL be validated against the active route, session token, origin, and fullscreen state. Any wrapper relay SHALL validate the sending origin and source window. The panel SHALL NOT grant arbitrary app pages access to general run-stop operations. After closure, runner state SHALL reflect the stopped session.

#### Scenario: Owned fullscreen app exits
- **WHEN** a directly opened app or launcher requests close with its current fullscreen preview credentials
- **THEN** only that managed browser session closes and the panel reports it stopped

#### Scenario: Child returns instead of closing
- **WHEN** a fullscreen browser app has a valid launcher return and Escape is pressed
- **THEN** the preview remains alive while the SDK returns to the launcher

#### Scenario: Unauthorized or obsolete close
- **WHEN** a foreign origin or source window, invalid token, stale route, stopped session, or windowed preview requests closure
- **THEN** the request cannot close the active browser preview or another running app
