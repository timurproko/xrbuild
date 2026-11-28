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

### Requirement: Libraries declare exposed parameters without starting applications

A component-library app SHALL be able to declare typed, serializable parameter metadata, defaults and supported choices. Consumers SHALL explicitly declare which libraries they use. Discovery SHALL resolve those declarations without mounting apps, executing their run entries or requesting devices. The initial supported parameter kind SHALL be a choice.

#### Scenario: Launcher consumes UI Kit
- **WHEN** the panel discovers Launcher and its UI Kit library reference
- **THEN** it discovers a Theme choice containing UI Kit's registered Default and Accent themes without starting either app

#### Scenario: Additional library or choice parameter
- **WHEN** another library or another choice parameter is declared and consumed
- **THEN** discovery and settings presentation work from those declarations without library-specific panel branches

#### Scenario: Invalid declaration or reference
- **WHEN** a declaration is malformed or references an unavailable library
- **THEN** discovery does not execute application code or silently resolve an unrelated library, and existing unrelated project settings remain intact

### Requirement: Library selections belong to the consuming project

Selections SHALL save through the existing per-project settings path with its validation, serialization and conflict handling. They SHALL be scoped by consuming project, library and parameter, preserve unrelated settings, survive reopening and not modify library defaults or installed product sources. Absent selections SHALL use the consumer's declared default, then the library default.

#### Scenario: Independent consumers
- **WHEN** one consumer saves Accent and another retains Default
- **THEN** reopening each project's settings retains its own choice without changing the library or the other app

#### Scenario: Bundled consumer settings
- **WHEN** a bundled consumer saves a library selection
- **THEN** its existing writable effective project settings retain the choice without writing to installed bundled sources

#### Scenario: Invalid choice and stale save
- **WHEN** a save supplies an undeclared choice or a stale project revision
- **THEN** the existing settings error path rejects it without overwriting newer or unrelated settings

### Requirement: Runtime selections drive existing component props

Supported live-settings sessions SHALL apply saved parameter values without restarting the app; other launch paths SHALL apply them on next start. Theme selection SHALL drive the existing scene theme prop, retain app and interaction state, and keep the SDK as sole render owner. Missing managed settings SHALL preserve standalone defaults. Retired sessions SHALL not apply updates to unrelated apps.

#### Scenario: Launcher changes theme live
- **WHEN** Launcher is running in a supported managed live session and its Theme choice is saved
- **THEN** its existing scene changes between Default and Accent without a new mount, SDK runtime or reset of catalog, paging, capture or accepted navigation state

#### Scenario: Next start and standalone use
- **WHEN** a consumer starts after saving a choice on a path without live delivery, or starts standalone without managed settings
- **THEN** it uses the saved choice on the former path and its declared default on the latter

#### Scenario: Session retirement
- **WHEN** an app session stops or another project becomes active
- **THEN** the retired session cannot read or apply the replacement project's values and its subscriptions are released

## ADDED Requirements

### Requirement: Settings changed during a run are temporary

While an app runs, a change to a live-capable setting (library parameters) SHALL apply to that run only, like a play mode: it SHALL reach the running app without restarting it and SHALL NOT be saved. Stopping the app, or starting another run, SHALL drop the temporary values so the tab and the next run show the saved values. Settings that take effect only on the next start SHALL be locked while the app runs. One panel mechanism SHALL hold temporary values for every live-capable kind of setting.

#### Scenario: Trying a theme while the app runs
- **WHEN** the person changes the Theme in Settings while the app runs
- **THEN** the running app switches theme in place, nothing is written to the project, and after Stop the tab shows the saved theme again

#### Scenario: Setting that needs a restart
- **WHEN** the app runs
- **THEN** Platform, Display, Input and other next-start settings are locked with a note to stop the app first
