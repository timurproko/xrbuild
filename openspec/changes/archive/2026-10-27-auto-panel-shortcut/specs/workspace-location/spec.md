## MODIFIED Requirements

### Requirement: User workspace resolution
Without an explicit workspace argument, the workspace SHALL be the folder named by `XRB_HOME` when it is set and `%USERPROFILE%\.xrbuild` otherwise. The panel and workspace dependency command SHALL use the same default, and the existence of `<repo>/.xrbuild/` SHALL NOT change this ordinary resolution. The prior `%USERPROFILE%\.xr-build` workspace SHALL NOT be automatically migrated or deleted; it remains available through an explicit `XRB_HOME` override.

#### Scenario: Ordinary user default
- **WHEN** a user starts the ordinary panel launcher with no `XRB_HOME`
- **THEN** the panel uses `%USERPROFILE%\.xrbuild` even when the source checkout also contains `.xrbuild/`

#### Scenario: Dependency tool default
- **WHEN** a user fetches workspace dependencies with no `XRB_HOME` or explicit workspace path
- **THEN** the dependency tool uses `%USERPROFILE%\.xrbuild`

#### Scenario: Environment override
- **WHEN** `XRB_HOME` names another workspace and no explicit workspace argument is given
- **THEN** the panel and workspace dependency command use the folder named by `XRB_HOME`

#### Scenario: Existing legacy workspace
- **WHEN** `%USERPROFILE%\.xr-build` exists and `XRB_HOME` is unset
- **THEN** the ordinary default still selects `%USERPROFILE%\.xrbuild` without moving or deleting the old folder
