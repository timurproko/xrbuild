## ADDED Requirements

### Requirement: Workspace tool navigation
The panel SHALL show stable Control Panel and Plugins Manager navigation entries with configured workspace tools between them, followed by a separator, Restart and Rebuild. Plugins Manager SHALL use its own stable `/plugins/` route rather than panel page state. Concrete tool locations SHALL come from the selected integration workspace, not hardcoded core paths or ports. A tool link SHALL open only a validated local HTTP destination and SHALL NOT start a tool service, camera or model.

#### Scenario: Configured tool
- **WHEN** the integration workspace registers a valid local tool
- **THEN** its plain-text label appears between Control Panel and Plugins Manager and its link retains the originating panel as a validated return destination

#### Scenario: Missing or invalid configuration
- **WHEN** tool configuration is absent or invalid
- **THEN** the standard panel stays usable, absent configuration adds no entries, and invalid configuration is reported rather than creating unsafe links

#### Scenario: Stable navigation
- **WHEN** the developer switches between projects, installed plugins and a configured tool
- **THEN** navigation labels stay fixed, the current page is identified and the menu supports keyboard and outside-click dismissal

### Requirement: Tool maintenance navigation is not authorization
A maintenance navigation URL SHALL NOT directly execute a rebuild or restart. The panel SHALL require explicit confirmation before using its existing state-changing maintenance endpoint, and consumed navigation parameters SHALL NOT repeat on refresh.

#### Scenario: Maintenance URL opened
- **WHEN** a developer or another page opens a maintenance navigation URL
- **THEN** the panel displays its confirmation without starting a job or restarting until the developer confirms

### Requirement: Stable tool startup presentation
Control Panel, Plugins Manager and a registered tool integrated by this change SHALL use the shared XR Build design system and distinct `XR Build · Product Name` page identity before showing application content. Control Panel SHALL use 🎛️, Hand Tracking SHALL use 👋 and Plugins Manager SHALL use 🧩 as browser favicons; project/custom icons SHALL remain limited to app previews and native app windows. A registered tool SHALL load the shared XR Build design system before showing application content and SHALL reveal the populated initial layout without flashing unstyled controls. Shared application chrome, typography, cards, tabs, status, menus and dropdown/listbox behavior SHALL come from the same design-system components used by the control panel rather than copied product styles or OS-rendered option popups. Startup failure SHALL be visible, and waiting for camera availability SHALL NOT prevent revealing an initialized tool.

#### Scenario: Shared dropdown
- **WHEN** either the panel or tool displays a single-choice field
- **THEN** it uses the shared accessible dropdown/listbox presentation while the underlying application value and change behavior remain intact

#### Scenario: Cold reload
- **WHEN** application modules are slow to load in either light or dark mode
- **THEN** the initial background matches the theme, uninitialized controls remain hidden and the initialized layout is revealed without starting acquisition

#### Scenario: Startup failure
- **WHEN** the tool cannot initialize
- **THEN** it shows a readable retry/error message instead of remaining indefinitely blank
