# Spec Delta

## MODIFIED Requirements

### Requirement: Theme selection is scoped and declared per consuming app

Apps SHALL select a theme through a scoped provider or controlled prop, with a side-effect-free declared per-app default identifier. Explicit control or scene choices SHALL override inheritance; inherited choices SHALL override app fallback defaults. Omitted selection SHALL fall back to Default without global mutable style or automatic persistence. Explicit project settings SHALL be applied through the existing scene prop; selectors SHALL remain outside app scenes.

#### Scenario: Real consuming apps
- **WHEN** UI Kit or Launcher runs with Default or an explicitly supplied Chamfer selection
- **THEN** its existing controls use that theme within its single SDK runtime and no selector, message or button is introduced inside the app; any declared panel selector uses the conditional component-library settings tab

#### Scenario: Nested and independent consumers
- **WHEN** two consuming subtrees choose different themes and one changes or removes its override
- **THEN** only the affected subtree re-resolves its visuals, app defaults do not mask an explicit surrounding choice and unrelated state remains independent

#### Scenario: Declared default import
- **WHEN** a consumer imports either app's declared theme default and reusable scene without mounting them
- **THEN** it can read the default identifier and supply a controlled selection without starting a renderer, timer, network request or device

#### Scenario: Imperative selection
- **WHEN** a non-component consumer supplies a theme at construction or changes an existing object's theme
- **THEN** the same built-in styles and visual-only switching behavior are available without a provider dependency

#### Scenario: Saved consuming-project selection
- **WHEN** Launcher starts with an explicitly saved UI Kit theme or receives it through a supported live-settings path
- **THEN** the existing scene prop selects that theme for Launcher only, without changing UI Kit's default declaration or introducing theme-selection UI inside Launcher
