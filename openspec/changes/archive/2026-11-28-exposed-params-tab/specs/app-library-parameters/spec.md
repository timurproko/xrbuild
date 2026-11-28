# Spec Delta

## Purpose

Allows consuming applications to discover, edit and retain component-library parameters through their ordinary project settings without bespoke settings UI or another app runtime.

## ADDED Requirements

### Requirement: Libraries declare exposed parameters without starting applications

A component-library app SHALL be able to declare typed, serializable parameter metadata, defaults and supported choices. Consumers SHALL explicitly declare which libraries they use. Discovery SHALL resolve those declarations without mounting apps, executing their run entries or requesting devices. The initial supported parameter kind SHALL be a choice.

#### Scenario: Launcher consumes UI Kit
- **WHEN** the panel discovers Launcher and its UI Kit library reference
- **THEN** it discovers a Theme choice containing UI Kit's registered Default and Chamfer themes without starting either app

#### Scenario: Additional library or choice parameter
- **WHEN** another library or another choice parameter is declared and consumed
- **THEN** discovery and settings presentation work from those declarations without library-specific panel branches

#### Scenario: Invalid declaration or reference
- **WHEN** a declaration is malformed or references an unavailable library
- **THEN** discovery does not execute application code or silently resolve an unrelated library, and existing unrelated project settings remain intact

### Requirement: Consuming project settings show one conditional library tab

The per-app panel SHALL show one Components tab directly after Develop only when the app consumes a library with exposed parameters. Parameters SHALL be grouped by library and reuse Develop's tab, row, label, select and wording conventions. This feature SHALL add no other visible UI, hints, messages, banners, buttons or confirmations.

#### Scenario: Launcher settings
- **WHEN** Launcher is selected and Components is opened
- **THEN** one UI Kit group shows its Theme selector using the existing settings presentation

#### Scenario: App with no exposed library parameters
- **WHEN** an app consumes no libraries or only libraries without exposed parameters
- **THEN** no Components tab appears and its existing panel UI remains unchanged

#### Scenario: Existing surfaces remain unchanged
- **WHEN** the user opens Develop, Publish or Build before and after this feature
- **THEN** existing content and actions remain unchanged except for the conditional additional tab

### Requirement: Library selections belong to the consuming project

Selections SHALL save through the existing per-project settings path with its validation, serialization and conflict handling. They SHALL be scoped by consuming project, library and parameter, preserve unrelated settings, survive reopening and not modify library defaults or installed product sources. Absent selections SHALL use the consumer's declared default, then the library default.

#### Scenario: Independent consumers
- **WHEN** one consumer saves Chamfer and another retains Default
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
- **THEN** its existing scene changes between Default and Chamfer without a new mount, SDK runtime or reset of catalog, paging, capture or accepted navigation state

#### Scenario: Next start and standalone use
- **WHEN** a consumer starts after saving a choice on a path without live delivery, or starts standalone without managed settings
- **THEN** it uses the saved choice on the former path and its declared default on the latter

#### Scenario: Session retirement
- **WHEN** an app session stops or another project becomes active
- **THEN** the retired session cannot read or apply the replacement project's values and its subscriptions are released
