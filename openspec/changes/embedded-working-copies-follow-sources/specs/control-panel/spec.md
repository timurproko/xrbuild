## ADDED Requirements

### Requirement: Existing embedded working copies follow installed sources

After the panel starts, and when Rebuild or Update finishes, the panel SHALL refresh every existing embedded working copy whose installed source changed, in one visible job, using the same locked preparation and merge rules as Run and Build. Discovery SHALL remain read-only, and a project that was never materialized SHALL stay unmaterialized.

#### Scenario: Restart after a core update

- **WHEN** a pull adds a manifest field such as `componentLibraries` to an embedded app with an existing working copy and the panel restarts
- **THEN** the refresh job updates that working copy and the project list shows the new manifest field without a Run

#### Scenario: Rebuild finishes

- **WHEN** Rebuild or Update completes successfully
- **THEN** it is followed by the same working-copy refresh job

#### Scenario: Never materialized

- **WHEN** an embedded project has no working copy
- **THEN** neither discovery nor the refresh job creates one

### Requirement: Refused embedded refreshes stay visible

An automatic refresh SHALL never overwrite personal edits. A conflict or invalid state SHALL leave the working state unchanged, fail the job and be shown on the project with how to recover. A project whose app is running or that has a job SHALL NOT be refreshed under it; it SHALL show that the update is pending and refresh once idle or on its next Run or Build.

#### Scenario: Conflicting local edit

- **WHEN** an installed source change conflicts with a personal edit in the working copy
- **THEN** the job fails naming the project, the working state and personal files stay unchanged, and the project shows the conflict and that resolving it and running Run or Build retries

#### Scenario: Project in use

- **WHEN** the project's app is running during the refresh
- **THEN** its working copy is left untouched, the project shows that the update follows when it is idle, and the refresh runs once the run ends
