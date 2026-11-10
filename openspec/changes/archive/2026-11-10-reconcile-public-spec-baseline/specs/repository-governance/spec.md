## REMOVED Requirements

### Requirement: Workspace direct push
**Reason**: The private workspace now owns its history in a separate repository; the public core has no workspace-only main bypass workflow.
**Migration**: Use ordinary Git in the independent private workspace. Core changes continue through reviewed PRs, and agents never push main in either repository. Remove the obsolete workspace-push command and hook dependency.

## ADDED Requirements

### Requirement: Governance target identity
The governance tool SHALL accept the core repository name `xrbuild` and SHALL reject other repository names before reading or writing their settings. The existing explicit apply confirmation SHALL remain required.

#### Scenario: Core repository
- **WHEN** a maintainer checks governance for a repository named `xrbuild`
- **THEN** the tool compares declared settings without rejecting the core's name

#### Scenario: Private workspace or archive
- **WHEN** governance is invoked for a repository with a different name
- **THEN** it refuses before making any settings API request
