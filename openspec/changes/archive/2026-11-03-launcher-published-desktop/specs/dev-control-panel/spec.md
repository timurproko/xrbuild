# dev-control-panel Specification Delta

## ADDED Requirements

### Requirement: Explicit project rebuild

The project-row context menu SHALL offer **Rebuild** for a project with a valid manifest build script. Choosing it SHALL always execute that script as a background web-build job even when the recorded output is current, SHALL finalize and verify the resulting browser output and build receipt, and SHALL make the job visible in Activity. The action SHALL NOT run, package, publish or unpublish the project. Projects without a valid build script SHALL omit the action rather than show it disabled.

#### Scenario: Rebuild current app

- **WHEN** a project's recorded browser output is current and the developer chooses **Rebuild** from its row context menu
- **THEN** the manifest build script runs again, the successful output and receipt are refreshed, and the new background job is selected in Activity

#### Scenario: Rebuild archived app

- **WHEN** an archived project has a valid build script and the developer chooses **Rebuild**
- **THEN** it rebuilds in place without being unarchived, run, packaged or published

#### Scenario: Project cannot rebuild

- **WHEN** a project has a broken manifest or no build script
- **THEN** its context menu contains no **Rebuild** action

#### Scenario: Rebuild fails

- **WHEN** the explicit app rebuild script fails or its output cannot be verified
- **THEN** the Activity job fails with its bounded build output and no successful receipt is advanced
