## ADDED Requirements

### Requirement: Optional packager prerequisites
A packager MAY expose read-only prerequisite status and an explicit setup operation. A packager that offers setup SHALL expose prerequisite status; its setup SHALL write progress to the provided job logger. A packager without setup SHALL retain its existing Build package behavior. The core SHALL NOT embed platform-specific installers.

#### Scenario: Missing dependencies
- **WHEN** a selected packager reports setup-required
- **THEN** the panel offers Setup rather than Build package and a direct package-build request is refused before building the app

#### Scenario: Existing packager
- **WHEN** a selected packager implements no setup hooks
- **THEN** the panel continues to offer Build package without installing dependencies or requiring a setup step

#### Scenario: Readiness cannot be checked
- **WHEN** the packager's prerequisite check fails
- **THEN** the panel reports the failure rather than claiming that package building is ready

### Requirement: Explicit packager setup
Packager setup SHALL start only on user request, SHALL be tracked as a background job and SHALL NOT build the app, publish it or update its package identity. If the installer requires acceptance of external terms, setup SHALL wait for the developer's explicit acknowledgement.

#### Scenario: Successful setup
- **WHEN** setup finishes and a fresh prerequisite check reports ready
- **THEN** the developer can request Build package without an automatic build or publication

#### Scenario: Failed setup
- **WHEN** setup fails or the required tools remain unavailable
- **THEN** the job retains diagnostic output, the panel continues to offer Setup for retry and no APK is claimed to exist
