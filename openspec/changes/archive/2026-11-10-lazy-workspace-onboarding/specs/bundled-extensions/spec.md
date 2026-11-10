## MODIFIED Requirements

### Requirement: User-owned plugin configuration defaults
Embedded plugins SHALL declare validated safe default configuration and store mutable user configuration only under the selected user workspace's `config/plugins/<plugin-id>/`. Discovery SHALL use validated in-memory defaults when configuration is absent without creating workspace folders or configuration files. Explicit configuration initialization SHALL create missing defaults without replacing existing files, including concurrent creators. Invalid existing configuration SHALL report a diagnostic, not be overwritten. Newly added missing fields MAY use validated in-memory defaults without rewriting existing user data. Link/path escapes SHALL be refused. Discovery SHALL NOT create credentials, signing keys or live production destinations.

#### Scenario: First and repeated startup
- **WHEN** a plugin's user configuration is absent and then the plugin is loaded again after the user explicitly creates or edits it
- **THEN** the first load uses validated defaults in memory without creating the selected root, and later loads preserve and use the user's file and values

#### Scenario: Invalid existing configuration
- **WHEN** the existing user config is malformed or points through an unsafe link
- **THEN** loading reports an actionable error without overwriting the config or falling back to a live deployment

#### Scenario: Concurrent first runs
- **WHEN** two explicit initialization operations attempt to create the same missing configuration
- **THEN** a complete valid configuration is visible and neither process replaces a file created or edited by the other

#### Scenario: Missing service workspace
- **WHEN** a public service factory is discovered before the selected user root exists
- **THEN** it may validate prospective user-owned paths and use in-memory defaults without creating them, while linked parents and product-source ownership violations remain refused
