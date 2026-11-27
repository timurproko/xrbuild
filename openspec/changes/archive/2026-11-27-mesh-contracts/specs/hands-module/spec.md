# Spec Delta

## MODIFIED Requirements

### Requirement: Simple post-processing selector

Hands SHALL show its independent post-processing selector below Skeleton provider only when at least one mesh plugin is installed. It SHALL offer None and installed plugins with existing settings and status; a missing saved choice SHALL remain visible when the selector is shown. Without installed plugins the entire section SHALL be hidden, including heading and empty text, without changing stored selection. Opening it SHALL not start capture, processing or installation.

#### Scenario: Empty installation
- **WHEN** no mesh plugins are installed, regardless of a retained saved choice
- **THEN** Hands shows no post-processing heading, selector, status or empty-state sentence and does not alter saved state

#### Scenario: Selected plugin unavailable
- **WHEN** at least one mesh plugin is installed and the saved plugin is missing, disabled or failed
- **THEN** the selector retains its saved identity and skeleton-fallback reason without automatic replacement

#### Scenario: Plugin installed
- **WHEN** at least one mesh plugin is installed
- **THEN** existing controls appear below the provider and status accurately distinguishes saved configuration from supported current-run delivery

### Requirement: Next-run selection and context notice
The selector SHALL save only post-processing selection/settings under the common profile revision discipline, independently of source and adjustment drafts. Compatible managed desktop runs SHALL follow committed configuration; older consumers SHALL receive next-run guidance without a false live-success claim. Browser previews, published web builds and offline packages SHALL remain excluded. Multiple-stage ordering and bypass controls SHALL remain absent.

#### Scenario: Save independently
- **WHEN** the person saves the mesh selection while source or adjustment drafts are dirty
- **THEN** those drafts remain unsaved, the running skeleton source is unchanged, and only supported post-processing delivery is attempted

#### Scenario: Context limitation
- **WHEN** the section is displayed
- **THEN** it says "Post-processing is used only in desktop apps run from this panel, not browser previews, published web builds or offline packages."

## ADDED Requirements

### Requirement: Post-processing delivery status contract
Post-processing status SHALL expose owner identity, desired saved revision, requested/applied generation, preparation state/progress/failure reason and current consumer drawing generation where supported. Missing evidence SHALL remain unknown. Skeleton-session acknowledgement SHALL not count as processor or drawing acknowledgement. Configuration persistence SHALL succeed independently of optional delivery failure.

#### Scenario: Saved but still preparing
- **WHEN** desired settings are persisted and their processor generation has not completed preparation
- **THEN** backend status distinguishes saved/applying from applied/drawing, exposes Preparing and leaves skeleton controls and acquisition unaffected

#### Scenario: Applied but not drawn
- **WHEN** a processor acknowledges a generation but no compatible SDK reports current valid drawing for it
- **THEN** status identifies applied settings without claiming the mesh is visible

#### Scenario: No Hands mesh session yet
- **WHEN** only the standalone Hands skeleton session exists and no managed desktop mesh consumer owns processing
- **THEN** backend configuration/status operations start no mesh or second provider and do not claim Hands viewport mesh delivery
