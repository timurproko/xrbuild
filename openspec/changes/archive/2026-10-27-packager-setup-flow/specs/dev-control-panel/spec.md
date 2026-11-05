## ADDED Requirements

### Requirement: Package setup action
When a selected packager reports missing prerequisites, the Build card SHALL show Setup in place of Build package. Setup SHALL open an installation dialog with live job output. After successful setup and a fresh ready status, the panel SHALL close the dialog and show Build package without starting it. Setup errors SHALL remain visible and retryable; status for a previously selected project or platform SHALL NOT repaint the current action.

#### Scenario: Tools missing
- **WHEN** the selected packager reports setup-required
- **THEN** the Build card shows Setup and does not launch the app build or package build

#### Scenario: Tools installed
- **WHEN** the developer clicks Setup and the installation job completes with all prerequisites present
- **THEN** the log dialog closes and the button changes to Build package, awaiting a separate click

#### Scenario: Install fails
- **WHEN** the installation job fails or readiness remains unavailable
- **THEN** the dialog keeps the error and logs visible, and the Build card continues to show Setup for retry

#### Scenario: Change platform during setup
- **WHEN** the developer selects another project or Platform while setup runs
- **THEN** setup continues in Jobs without blocking navigation, and only the relevant packager's Build card is updated

#### Scenario: External terms required
- **WHEN** the packager reports external terms that must be accepted before setup
- **THEN** the panel presents the terms link and asks for explicit consent before starting installation
