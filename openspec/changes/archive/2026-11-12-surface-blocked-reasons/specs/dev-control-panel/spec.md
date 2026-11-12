## ADDED Requirements

### Requirement: Specific launch refusal causes

When the panel refuses Run or Preview, it SHALL report the first blocking cause with its own message and a stable
reason code. A cause that only a panel restart clears SHALL say so, and the error dialog SHALL offer Restart. The
panel SHALL NOT tell the user to wait for a cause that waiting cannot clear.

#### Scenario: Plugin code changed under a running panel
- **WHEN** plugin module code changed after the panel loaded it and the user chooses Run
- **THEN** the refusal says the panel must restart to use the changed plugins and offers Restart

#### Scenario: Settings save in progress
- **WHEN** the user chooses Run while that project's settings are being saved
- **THEN** the refusal says the settings save is in progress and retrying after it finishes succeeds

#### Scenario: Another launch preparing
- **WHEN** a native launch or preview is being prepared and the user chooses Run
- **THEN** the refusal names the launch in preparation rather than settings saving

### Requirement: Plugin configuration in Settings

Settings SHALL render a plugin's declared user configuration fields as a Configuration section in that plugin's card.
Saves SHALL validate against the schema, require the current revision, preserve unknown fields, replace the user
config file atomically and refresh plugin services when idle. Saves SHALL be refused with a specific cause while
plugins, runs or jobs are in use. Configuration SHALL NOT hold credentials.

#### Scenario: Fill a destination
- **WHEN** a user enters valid configuration values for an enabled publisher plugin and saves
- **THEN** the file holds the new values with unknown fields preserved, services refresh, and the publisher becomes available

#### Scenario: Stale configuration edit
- **WHEN** the file changed on disk after Settings loaded it
- **THEN** the save is refused as stale and the current values are shown without overwriting them

#### Scenario: Invalid value
- **WHEN** a field value violates its declared type or limits
- **THEN** the save is refused with a field error and the file is unchanged

### Requirement: Destination-scoped configuration tabs

A configuration field MAY name a boolean runtime setting of the same plugin that it belongs to. Settings SHALL show
that field only while the setting is on. Configuration sections SHALL render as shared tabs, one per section with at
least one shown field; Save SHALL keep values typed in other tabs and SHALL send only shown fields.

#### Scenario: Destination turned off
- **WHEN** a publisher destination checkbox is off
- **THEN** that destination's configuration tab and fields are hidden and its saved values are left unchanged

#### Scenario: Destination turned on
- **WHEN** the user turns the destination checkbox on
- **THEN** its configuration tab appears without discarding values typed in other tabs

### Requirement: Unconfigured publisher presentation

When a publisher reports that it is not configured, the Publish card SHALL list it by its label followed by
"(not configured)", never by a placeholder hostname. Selecting it SHALL disable Publish, show its configuration
problem and link to that plugin's Settings section.

#### Scenario: Production destination not configured
- **WHEN** a publisher plugin's production destination is enabled but not configured
- **THEN** the dropdown shows "Production (not configured)", Publish is disabled, and a Configure link opens that plugin's Settings
