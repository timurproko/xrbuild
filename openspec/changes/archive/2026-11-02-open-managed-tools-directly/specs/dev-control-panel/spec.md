## MODIFIED Requirements

### Requirement: Workspace tool navigation
The panel SHALL show stable Control Panel and Plugins Manager navigation entries with configured workspace tools between them, followed by a separator, Restart and Rebuild. Plugins Manager SHALL use its own stable `/plugins/` route rather than panel page state. Concrete tool registrations SHALL come from the selected integration workspace, not hardcoded core paths or ports. An enabled plugin MAY provision bounded panel-managed entries through its plugin manifest; disabling that plugin SHALL remove its entries and start nothing. The existing optional workspace tool file MAY continue to register validated external loopback links or panel-managed tools. Plugin and workspace entries SHALL share one ID/path ownership validation, and plugin metadata SHALL NOT contain commands, arguments or credentials. Loading either form SHALL NOT start camera capture, a model worker, recording or a native camera service. When pinned package setup is required for managed tools, the panel SHALL complete its fixed frozen-lockfile setup before listening and opening the browser rather than during tool navigation.

#### Scenario: Configured tool
- **WHEN** an enabled integration-workspace plugin declares a valid managed panel tool and the developer follows its navigation entry
- **THEN** the panel loads the plugin-relative contained module once and opens its stable route on the panel origin without requiring a terminal command, separate fixed port or intermediate setup page

#### Scenario: Disabled plugin
- **WHEN** a plugin that declares a panel tool is disabled
- **THEN** its navigation entry is absent and neither its module nor any owned service starts

#### Scenario: Combined ownership collision
- **WHEN** enabled plugin tools or workspace tools repeat an ID or overlap routes/endpoints
- **THEN** navigation reports the invalid combined inventory and imports none of the conflicting modules

#### Scenario: Managed package setup after a pull
- **WHEN** the panel starts with configured managed tools and their pinned workspace package graph is missing or stale
- **THEN** the panel runs its fixed bounded frozen-lockfile setup before it listens or opens the browser, and later tool navigation runs no package installer

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
Control Panel, Plugins Manager and a registered tool SHALL use the shared XR Build design system and distinct `XR Build · Product Name` page identity before showing application content. Project/custom icons SHALL remain limited to app previews and native app windows. A managed tool's initial document request SHALL join its single-flight local web-runtime initialization and, on success, receive the application document directly without a separate panel-owned startup page. A terminal initialization failure SHALL remain readable and retryable. Shared application chrome, typography, cards, tabs, states, menus and dropdown/listbox behavior SHALL come from the same design-system components used by the panel rather than copied product styles or OS-rendered option popups. Waiting for camera availability SHALL NOT prevent revealing an initialized tool.

#### Scenario: Shared dropdown
- **WHEN** either the panel or tool displays a single-choice field
- **THEN** it uses the shared accessible dropdown/listbox presentation while the underlying application value and change behavior remain intact

#### Scenario: Managed cold start
- **WHEN** the developer opens a managed tool whose web runtime has not started
- **THEN** the document request shares one initialization attempt with concurrent requests and its first successful response is the tool application, not a Starting or setup document

#### Scenario: Startup failure
- **WHEN** the managed tool module cannot initialize or its dependencies are unavailable
- **THEN** the document request completes with a readable error and explicit retry action while Control Panel and Plugins Manager remain usable

#### Scenario: Cold reload
- **WHEN** application modules are slow to load in either light or dark mode
- **THEN** the browser keeps loading the requested application document, whose initial background matches the theme and whose uninitialized controls remain hidden without starting acquisition

### Requirement: Managed tool authorization boundary
Opening or reloading a managed tool SHALL authorize only initialization of its local web runtime. Camera acquisition, model initialization, recording, native compilation and device-service creation SHALL remain outside navigation and behind the appropriate build/distribution or explicit user-action boundaries. Navigation, browser preloading and startup retries SHALL NOT count as capture, calibration or recording actions.

#### Scenario: Open tracking diagnostic
- **WHEN** the developer opens the managed Hand Tracking Input diagnostic and takes no capture action
- **THEN** the application document opens with zero camera streams, model workers, recordings, native builds and native camera services

#### Scenario: Explicit capture later
- **WHEN** the initialized tool's developer explicitly starts capture or calibration
- **THEN** its existing ownership, permission and cleanup rules apply using the prepared native runtime exactly as they do when the tool is launched directly
