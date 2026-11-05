## MODIFIED Requirements

### Requirement: Workspace tool navigation
The panel SHALL show stable Control Panel and Plugins Manager navigation entries with configured workspace tools between them, followed by a separator, Restart and Rebuild. Plugins Manager SHALL use its own stable `/plugins/` route rather than panel page state. Concrete tool registrations SHALL come from the selected integration workspace, not hardcoded core paths or ports. A tool MAY be either a validated external loopback link, which remains passive, or a panel-managed tool with a validated panel route and contained workspace module. Loading either form SHALL NOT start camera capture, a model worker, recording or a native camera service.

#### Scenario: Configured tool
- **WHEN** the integration workspace registers a valid managed tool and the developer follows its navigation entry
- **THEN** the panel initializes that tool once and opens its stable route on the panel origin without requiring a terminal command or separate fixed port

#### Scenario: External configured tool
- **WHEN** the integration workspace registers a valid external loopback tool
- **THEN** its plain-text label links to that validated destination, retains the originating panel as a validated return destination when configured, and starts no process

#### Scenario: Missing or invalid configuration
- **WHEN** tool configuration is absent or invalid
- **THEN** the standard panel stays usable, absent configuration adds no entries, and invalid configuration is reported rather than loading a module or creating an unsafe link

#### Scenario: Stable navigation
- **WHEN** the developer switches between projects, installed plugins and a configured tool
- **THEN** navigation labels stay fixed, the current page is identified and the menu supports keyboard and outside-click dismissal

### Requirement: Stable tool startup presentation
Control Panel, Plugins Manager and a registered tool SHALL use the shared XR Build design system and distinct `XR Build · Product Name` page identity before showing application content. Project/custom icons SHALL remain limited to app previews and native app windows. A managed tool SHALL show a themed initialization state while its module starts, reveal its populated initial layout without flashing unstyled controls, and show an actionable retry state when initialization fails. Shared application chrome, typography, cards, tabs, states, menus and dropdown/listbox behavior SHALL come from the same design-system components used by the panel rather than copied product styles or OS-rendered option popups. Waiting for camera availability SHALL NOT prevent revealing an initialized tool.

#### Scenario: Shared dropdown
- **WHEN** either the panel or tool displays a single-choice field
- **THEN** it uses the shared accessible dropdown/listbox presentation while the underlying application value and change behavior remain intact

#### Scenario: Managed cold start
- **WHEN** the developer opens a managed tool whose module has not started
- **THEN** the panel route remains reachable, shows themed startup presentation, shares one initialization attempt across concurrent requests and reveals the tool when ready

#### Scenario: Startup failure
- **WHEN** the managed tool module cannot initialize or its dependencies are unavailable
- **THEN** the route shows a readable error and explicit retry action while Control Panel and Plugins Manager remain usable

#### Scenario: Cold reload
- **WHEN** application modules are slow to load in either light or dark mode
- **THEN** the initial background matches the theme, uninitialized controls remain hidden and the initialized layout is revealed without starting acquisition

## ADDED Requirements

### Requirement: Managed workspace tool lifecycle
A panel-managed workspace tool SHALL be loaded only from a canonical module path inside the selected integration workspace. Its configured route and any additional endpoint prefixes SHALL be local absolute paths that do not overlap another tool or reserved panel/API routes. The panel SHALL keep at most one active instance per tool, route only its declared requests to it, and invoke bounded cleanup when the panel restarts or exits. Tool configuration SHALL NOT contain or select a shell command.

#### Scenario: Contained module
- **WHEN** configuration names a module outside the workspace through traversal, an absolute path, a link escape or an unsupported file type
- **THEN** validation rejects it before import and the panel starts nothing

#### Scenario: Route collision
- **WHEN** a managed tool requests `/`, `/plugins/`, a panel API namespace, a maintenance route or a path already owned by another tool
- **THEN** validation rejects the registration and preserves the existing route

#### Scenario: One initialization
- **WHEN** multiple browser requests reach an inactive managed tool while it starts
- **THEN** they share one initialization attempt and no duplicate module instance, helper or listener is created

#### Scenario: Panel shutdown
- **WHEN** the panel restarts or exits with managed tools active
- **THEN** it asks every active tool to release its HTTP/upgrade listeners and owned local services within a bound, then continues panel shutdown

### Requirement: Managed tool authorization boundary
Opening or reloading a managed tool SHALL authorize only initialization of its local web runtime. Camera acquisition, model initialization, recording and device-service creation SHALL remain behind the tool's existing explicit user actions and same-origin security checks. Navigation, browser preloading and startup retries SHALL NOT count as those actions.

#### Scenario: Open tracking diagnostic
- **WHEN** the developer opens the managed tracking diagnostic and takes no capture action
- **THEN** the page initializes with zero camera streams, model workers, recordings and native camera services

#### Scenario: Explicit capture later
- **WHEN** the initialized tool's developer explicitly starts capture or calibration
- **THEN** its existing ownership, permission and cleanup rules apply exactly as they do when the tool is launched directly
