# Spec Delta

## MODIFIED Requirements

### Requirement: Consuming project settings show one conditional library tab

The per-app panel SHALL show one Settings tab as the last workflow tab only when the app consumes a library with exposed parameters, including a library app that consumes its own parameters. Parameters SHALL be grouped by library under a plain card title and reuse Develop's row, label, select and wording conventions. This feature SHALL add no other visible UI, hints, messages, banners, buttons or confirmations.

#### Scenario: Launcher settings
- **WHEN** Launcher is selected and Settings is opened
- **THEN** one UI Kit group shows its Theme selector using the existing settings presentation

#### Scenario: Library app shows its own settings
- **WHEN** UI Kit is selected
- **THEN** it has a Settings tab whose Theme chooses the theme UI Kit shows when it runs, live while it runs

#### Scenario: App with no exposed library parameters
- **WHEN** an app consumes no libraries or only libraries without exposed parameters
- **THEN** no Settings tab appears and its existing panel UI remains unchanged

#### Scenario: Existing surfaces remain unchanged
- **WHEN** the user opens Develop, Publish or Build before and after this feature
- **THEN** existing content and actions remain unchanged except for the conditional additional tab
