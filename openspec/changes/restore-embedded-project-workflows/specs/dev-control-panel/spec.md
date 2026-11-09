## ADDED Requirements

### Requirement: Unified embedded project workflow
The Apps UI SHALL render embedded and ordinary projects through the same compact project card and capability-based Develop, Publish and Build workflows. Embedded origin SHALL NOT replace the normal workflow with a separate read-only screen, separate mandatory project sections or a required Copy to workspace form. Embedded rows SHALL support normal context-menu actions, section drag/drop, ordering, archive and unarchive. Delete SHALL be unavailable for embedded entries with an understandable explanation, backed by server enforcement. Ordinary missing capability, active-use, configuration and validation constraints SHALL apply equally to both origins. Shared design-system geometry and controls SHALL be used for both.

#### Scenario: Embedded app detail
- **WHEN** the user selects a valid embedded app
- **THEN** its card uses the normal compact identity row and workflow tabs, with actions enabled according to normal project capabilities instead of an embedded-only restriction

#### Scenario: Build and publish from the normal card
- **WHEN** the user configures a supported packager or publisher for an embedded app and starts the action
- **THEN** the normal settings, jobs, action-state and result UI are used without requesting an independent project copy

#### Scenario: Normal controls and durable edits
- **WHEN** the user edits an embedded app's platform, provider, name or icon through normal controls and reloads the panel
- **THEN** the saved effective choices remain visible and usable without changes to installed defaults

#### Scenario: Embedded context menu and drag/drop
- **WHEN** the user opens an embedded row menu or drags it within/between sections or between Projects and Archive
- **THEN** normal supported actions are offered and organization changes persist, with only Delete unavailable because of embedded origin

#### Scenario: Kind and capability restrictions
- **WHEN** either an ordinary or embedded project lacks a development script, packageable kind, compatible packager, configured publisher or required signing tools
- **THEN** the UI explains the same ordinary capability/configuration restriction rather than promising unconditional execution or requiring a copy based on origin

#### Scenario: Layout parity
- **WHEN** equivalent embedded and ordinary apps are viewed at desktop and narrow viewport sizes
- **THEN** their tabs, identity rows, fields and primary actions follow the same shared compact geometry without the former tall embedded-only form
