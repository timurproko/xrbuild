## ADDED Requirements

### Requirement: Explicit workspace launch
The panel command line SHALL accept an explicit workspace path. The ordinary panel command and launcher SHALL continue to use `XRB_HOME` or the home-directory default, while a separate repository-development command and launcher SHALL select the current checkout's `.xrbuild/` workspace.

#### Scenario: Ordinary launcher
- **WHEN** a user runs the ordinary launcher with no `XRB_HOME`
- **THEN** the panel opens the workspace at `%USERPROFILE%\.xr-build`

#### Scenario: Repository-development launcher
- **WHEN** the maintainer runs the repository-development launcher from a checkout
- **THEN** the panel opens that checkout's `.xrbuild/` as a real workspace and shows its path in the top bar

#### Scenario: Explicit path overrides environment
- **WHEN** the panel receives an explicit workspace path while `XRB_HOME` names a different folder
- **THEN** the panel uses the explicit path
