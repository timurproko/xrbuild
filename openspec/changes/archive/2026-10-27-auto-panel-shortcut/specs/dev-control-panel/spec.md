## MODIFIED Requirements

### Requirement: Explicit workspace launch
The panel command line SHALL accept an explicit workspace path. The ordinary panel command and launcher SHALL use `XRB_HOME` when set, otherwise `%USERPROFILE%\.xrbuild`, on the ordinary default panel port. A separate repository-development command and launcher SHALL select the current checkout's `.xrbuild/` workspace and a distinct default panel port. A per-invocation port override SHALL take precedence over the default port for either mode.

#### Scenario: Ordinary launcher
- **WHEN** a user runs the ordinary launcher with no `XRB_HOME`
- **THEN** the panel opens the workspace at `%USERPROFILE%\.xrbuild` on the ordinary default port

#### Scenario: Repository-development launcher
- **WHEN** the maintainer runs the repository-development launcher from a checkout, with `XRB_HOME` naming a different folder
- **THEN** the panel opens that checkout's `.xrbuild/` on its separate default port and shows its path in the top bar

#### Scenario: Explicit path overrides environment
- **WHEN** the panel receives an explicit workspace path while `XRB_HOME` names a different folder
- **THEN** the panel uses the explicit path

#### Scenario: Both modes running
- **WHEN** a user-mode panel is already running on its default port and the maintainer starts the repository-development launcher
- **THEN** the developer panel starts on its distinct default port and neither instance changes the other's workspace

### Requirement: Opt-in repository shortcut
The Start-menu installer SHALL create one current-user shortcut, defaulting to an auto-routing launcher from the checkout where it runs. An explicit repository option SHALL force that shortcut to use the repository-development launcher, and an explicit user option SHALL force it to use the ordinary launcher. Reinstalling without an option SHALL restore auto routing. The installer SHALL NOT set a permanent workspace environment variable or change other users' shortcuts.

#### Scenario: Install the default shortcut
- **WHEN** a user runs the Start-menu installer without a mode option
- **THEN** its one shortcut launches the auto-routing panel and checks the selected user workspace directory at each launch

#### Scenario: Opt into the developer shortcut
- **WHEN** a developer runs the installer with its repository option from a checkout
- **THEN** their shortcut always launches that checkout's repository-development panel, even when `XRB_HOME` names another folder

#### Scenario: Restore ordinary shortcut
- **WHEN** a developer runs the installer with its user option
- **THEN** their shortcut launches the ordinary panel using `XRB_HOME` or the home default without changing other users' installations or workspace folders

## ADDED Requirements

### Requirement: Auto-routing Start shortcut
The auto-routing Start-menu launcher SHALL check the user workspace directory selected by `XRB_HOME`, else `%USERPROFILE%\.xrbuild`, on each run. If that directory exists, it SHALL open user mode, even when empty. Otherwise it SHALL open the current checkout's `.xrbuild/` when available, falling back to user setup when not. It SHALL leave ordinary and explicit repository commands unchanged and SHALL NOT create or remove workspace folders.

#### Scenario: Existing empty user directory
- **WHEN** the selected user workspace is an existing empty directory and the repository also contains `.xrbuild/`
- **THEN** the shortcut opens user mode on port 5180 and displays the usual Create your workspace setup instead of repository projects

#### Scenario: Absent user directory
- **WHEN** the selected user workspace directory does not exist and the current checkout contains `.xrbuild/`
- **THEN** the shortcut opens the checkout's embedded workspace on port 5181, even when `XRB_HOME` names the absent user directory

#### Scenario: User environment precedence
- **WHEN** `XRB_HOME` names an existing directory but the default home directory is absent
- **THEN** the shortcut chooses the `XRB_HOME` user workspace, not the repository workspace

#### Scenario: Home default
- **WHEN** `XRB_HOME` is unset and `%USERPROFILE%\.xrbuild` exists
- **THEN** the shortcut opens that ordinary user workspace

#### Scenario: No embedded workspace
- **WHEN** the selected user workspace directory and the checkout's embedded workspace are both absent
- **THEN** the shortcut opens the normal user setup flow rather than pointing to a missing repository workspace

#### Scenario: Toggle without reinstalling
- **WHEN** the developer creates or removes the selected home workspace directory between shortcut launches
- **THEN** the next launch selects the corresponding user or repository workspace without changing the installed shortcut

#### Scenario: Running panel has another workspace
- **WHEN** the auto shortcut selects a workspace but its chosen port already serves a different workspace
- **THEN** it refuses to open that other workspace or change the running server; an explicit per-process port override remains available
