## MODIFIED Requirements

### Requirement: Start without a terminal
The panel SHALL start from a single launcher that shows no console window. The launcher opens the panel in the default browser. When a panel for the same workspace is already running on the selected port, the launcher opens that panel instead of starting a second server. A panel on the selected port for another workspace SHALL NOT be opened as though it served the requested workspace.

#### Scenario: First start
- **WHEN** the developer runs the panel launcher and no panel is running on its selected port
- **THEN** the panel server starts with no visible console window and the browser opens the panel page

#### Scenario: Already running
- **WHEN** the developer runs the launcher while a panel for that workspace is already running on its selected port
- **THEN** the browser opens the running panel and no second server starts

#### Scenario: Different workspace on the selected port
- **WHEN** the developer runs the launcher while another workspace's panel is already running on its selected port
- **THEN** the launcher refuses to open that unrelated panel or change its workspace and reports the collision

### Requirement: Explicit workspace launch
The panel command line SHALL accept an explicit workspace path. The ordinary panel command and launcher SHALL continue to use `XRB_HOME` or the home-directory default and the ordinary default panel port. A separate repository-development command and launcher SHALL select the current checkout's `.xrbuild/` workspace and a distinct default panel port. A per-invocation port override SHALL take precedence over the default port for either mode.

#### Scenario: Ordinary launcher
- **WHEN** a user runs the ordinary launcher with no `XRB_HOME`
- **THEN** the panel opens the workspace at `%USERPROFILE%\.xr-build` on the ordinary default port

#### Scenario: Repository-development launcher
- **WHEN** the maintainer runs the repository-development launcher from a checkout, with `XRB_HOME` naming a different folder
- **THEN** the panel opens that checkout's `.xrbuild/` on its separate default port and shows its path in the top bar

#### Scenario: Explicit path overrides environment
- **WHEN** the panel receives an explicit workspace path while `XRB_HOME` names a different folder
- **THEN** the panel uses the explicit path

#### Scenario: Both modes running
- **WHEN** a user-mode panel is already running on its default port and the maintainer starts the repository-development launcher
- **THEN** the developer panel starts on its distinct default port and neither instance changes the other's workspace

## ADDED Requirements

### Requirement: Opt-in repository shortcut
The Start-menu installer SHALL keep the ordinary panel as its default. An explicit per-user repository option SHALL set that user's shortcut to the repository-development launcher from the checkout where the installer is run, without setting a permanent workspace environment variable. Choosing ordinary mode again SHALL restore the ordinary shortcut.

#### Scenario: Install the default shortcut
- **WHEN** a user runs the Start-menu installer without the repository option
- **THEN** the shortcut launches the ordinary panel and retains `XRB_HOME` or the home default

#### Scenario: Opt into the developer shortcut
- **WHEN** a developer runs the installer with its repository option from a checkout
- **THEN** their shortcut launches that checkout's repository-development panel, even when `XRB_HOME` names another folder

#### Scenario: Restore ordinary shortcut
- **WHEN** a developer runs the installer again without the repository option
- **THEN** their shortcut again launches the ordinary panel without changing other users' installations or workspace folders
