# Spec Delta

## ADDED Requirements

### Requirement: Simple post-processing selector
Hands SHALL provide one independently mounted selector offering None or an installed mesh plugin, with its few schema-rendered settings and readiness/runtime status beneath it. A missing saved selection SHALL remain visible. No plugins SHALL show a one-sentence empty state. Opening the section SHALL not start capture, processing or installation.

#### Scenario: Empty installation
- **WHEN** no mesh plugins are installed or selected
- **THEN** the section offers None and says "No post-processing plugins installed."

#### Scenario: Selected plugin unavailable
- **WHEN** the saved plugin is missing, disabled or failed
- **THEN** its identity and skeleton-fallback reason remain visible without automatic replacement

### Requirement: Next-run selection and context notice
The selector SHALL save only post-processing selection/settings under the common profile revision discipline, independently of source and adjustment drafts. It SHALL label changes as applying on the next desktop run and disclose that browser previews, published web builds and offline packages do not use post-processing. It SHALL offer no multiple-stage ordering or bypass controls.

#### Scenario: Save independently
- **WHEN** the person saves the mesh selection while source or adjustment drafts are dirty
- **THEN** those drafts remain unsaved and the running app retains its current mesh selection

#### Scenario: Context limitation
- **WHEN** the section is displayed
- **THEN** it says "Post-processing is used only in desktop apps run from this panel, not browser previews, published web builds or offline packages."
