# Spec Delta

## ADDED Requirements

### Requirement: Installed post-processing section
Hands SHALL provide a self-contained Post-processing section listing installed stages by fixed slot with enable switches, saved order, schema-rendered settings and truthful readiness/runtime status. Missing saved stages SHALL remain visible with recovery reasons. An empty registry SHALL show one sentence explaining the absence. Navigation SHALL remain passive and SHALL not claim stage execution without runtime evidence.

#### Scenario: No installed stages
- **WHEN** Hands opens with no installed or saved stages
- **THEN** the section says "No post-processing plugins installed; plugins can add skeleton refinement and hand meshes." and does not offer a fabricated processor

#### Scenario: Installed but not started
- **WHEN** an installed stage is enabled but no consuming session has started
- **THEN** the section distinguishes readiness from running and does not start a process or download assets

#### Scenario: Incompatible saved settings
- **WHEN** an installed declaration changes the settings schema or content identity bound by saved choices
- **THEN** the row explains the mismatch and blocks use until explicit review rather than silently migrating or discarding settings

### Requirement: Independent next-session pipeline editing
Pipeline Save SHALL persist only the Post-processing draft under the common Hands revision discipline. Source Save and adjustment Apply SHALL not implicitly save or discard it. The section SHALL identify pipeline edits as next-session changes, restrict ordering to each fixed slot, and make skeleton bypass an explicit informed choice rather than a default. Dirty drafts SHALL survive unrelated refreshes and require review on conflicts.

#### Scenario: Save versus Apply
- **WHEN** an adjustment Apply occurs while the pipeline draft is dirty
- **THEN** the active run retains its pinned pipeline and the unsaved stage draft remains unchanged

#### Scenario: Move between slots
- **WHEN** a person reorders installed stages
- **THEN** order changes only within the declared slot and invalid dependency or channel conflicts are shown before Save

#### Scenario: Runtime failure
- **WHEN** a running stage fails or exceeds its deadline
- **THEN** its row shows failed, over-budget or explicitly bypassed status independently of source status and offers an explicit recovery action
