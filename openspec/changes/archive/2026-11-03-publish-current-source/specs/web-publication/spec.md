## MODIFIED Requirements

### Requirement: Verified build input
The core SHALL call a publisher only with a successful web build whose entry tree still matches its persisted build receipt. When the project has a configured browser build script, every Publish request SHALL run that script from current source, finalize the output and verify its fresh receipt before calling the publisher, even when a prior receipt is valid. A project without a build script MAY reuse only current verified static output. The input SHALL contain only files inside the built entry folder.

#### Scenario: Current build
- **WHEN** a project with a build script requests Publish while its prior build receipt and entry tree are still valid
- **THEN** Publish runs the build script again and passes the publisher only the newly finalized and verified output

#### Scenario: Changed output
- **WHEN** built output or relevant settings changed after the last successful build
- **THEN** Publish rebuilds automatically and calls the publisher only if the new output succeeds and remains current

#### Scenario: Static current output
- **WHEN** a project has no build script and its existing entry tree matches a successful receipt
- **THEN** Publish may pass that verified static entry to the publisher without claiming it rebuilt source

#### Scenario: Unsafe entry
- **WHEN** the entry has no index page, contains a link or escapes the project folder
- **THEN** the publisher is not called
