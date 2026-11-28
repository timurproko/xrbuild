# Spec Delta

## MODIFIED Requirements

### Requirement: Themes supply complete visual styles

A UI Kit theme SHALL supply geometry, material, state-colour and applicable typography styling for every public control and visual primitive. The built-in Default and Accent themes SHALL cover every supported variant. Accent SHALL visibly differ in mesh profiles and material treatment, not only colours: solid accent bodies with soft filleted edges and a satin finish, text and icons on those bodies in the theme's ink for them, and a slider that fills inside its dark channel with a half-accent fill. A saved earlier Accent selection SHALL resolve to Accent.

#### Scenario: Complete themed control collection
- **WHEN** an app uses Board, pill and round text/icon Buttons, Switch, Segmented, continuous and stepped Sliders, Dial, Trackball, Dialog, Label, Icon and GlassEdge with either built-in theme
- **THEN** every element, title/status, feedback cue and internally owned Close control uses a complete coherent style without missing visual roles

#### Scenario: Geometry-style difference
- **WHEN** corresponding Default and Accent controls are shown in matching rest and active states
- **THEN** Accent presents solid accent capsules and pucks with soft fillets, a rocker switch, a dot-sphere trackball around a sample head, controls without wells, a plain slider thumb with one white line and a slider that fills inside its dark channel, with consistent satin materials and legible feedback

#### Scenario: Invalid style selection
- **WHEN** a consumer supplies an unknown theme identifier or an incomplete theme definition
- **THEN** selection fails clearly without destroying the current visuals, interaction state or owned-resource accounting

### Requirement: Theme selection is scoped and declared per consuming app

Apps SHALL select a theme through a scoped provider or controlled prop, with a side-effect-free declared per-app default identifier. Explicit control or scene choices SHALL override inheritance; inherited choices SHALL override app fallback defaults. Omitted selection SHALL fall back to Default without global mutable style or automatic persistence. Explicit project settings SHALL be applied through the existing scene prop; selectors SHALL remain outside app scenes.

#### Scenario: Real consuming apps
- **WHEN** UI Kit or Launcher runs with Default or an explicitly supplied Accent selection
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

### Requirement: Visual replacement releases only owned resources

A theme switch SHALL dispose retired owned geometry, materials and textures exactly once and SHALL NOT dispose borrowed inputs, consumer children or the SDK renderer. Repeated switching, development replay and final teardown SHALL leave bounded resources and one live update/registration owner per object. Failed replacement SHALL retire staged resources without damaging the current visuals.

#### Scenario: Repeated switches and final teardown
- **WHEN** controls repeatedly switch Default to Accent and back, including dynamic slider fill and nested dialog controls, then unmount twice
- **THEN** superseded resources retire once, live resource/target counts remain bounded and final teardown leaves no owned targets, callbacks or graphics resources

#### Scenario: Borrowed resource survival
- **WHEN** an object with caller-supplied texture maps or caller-added children changes theme or is removed
- **THEN** those borrowed resources and sibling instances remain usable while only the object's owned visual resources are released

#### Scenario: Callback and development updates
- **WHEN** callbacks change, strict development effects replay or hot replacement occurs under a provider
- **THEN** the latest callbacks receive live events, no extra frame loop or duplicate Close update starts and retired callbacks cannot run after cleanup
