## MODIFIED Requirements

### Requirement: Auto-routing Start shortcut
The auto-routing Start-menu launcher SHALL always select the user workspace named by `XRB_HOME`, else `%USERPROFILE%\.xrbuild`, on port 5180. A missing, empty or otherwise uninitialized selected directory SHALL display the normal Create your workspace setup, even when the current checkout contains an embedded `.xrbuild/`. Repository development SHALL remain available only through its explicit launcher or workspace argument. Top-level browser refreshes from an older auto-routed repository panel SHALL silently start or reuse the selected user panel and redirect there without mutating either server's workspace. The launcher SHALL NOT create or remove workspace folders before the user confirms setup.

#### Scenario: Absent user directory
- **WHEN** the selected user `.xrbuild` directory does not exist and the checkout contains its own `.xrbuild/`
- **THEN** the shortcut opens user mode on port 5180 and displays Create your workspace instead of repository projects

#### Scenario: Existing empty user directory
- **WHEN** the selected user `.xrbuild` directory exists but is empty or uninitialized
- **THEN** the shortcut displays Create your workspace and does not treat the checkout workspace as a fallback

#### Scenario: User environment precedence
- **WHEN** `XRB_HOME` names a missing, empty or initialized workspace
- **THEN** the shortcut selects that path in user mode and either displays setup or the initialized workspace as appropriate

#### Scenario: Home default
- **WHEN** `XRB_HOME` is unset and `%USERPROFILE%\.xrbuild` is initialized
- **THEN** the shortcut opens that ordinary user workspace

#### Scenario: No embedded workspace
- **WHEN** the selected user workspace directory and the checkout's embedded workspace are both absent
- **THEN** the shortcut opens the normal user setup flow on the selected user path

#### Scenario: Toggle without reinstalling
- **WHEN** the developer creates or removes the selected home workspace directory between shortcut launches
- **THEN** the next launch continues to select that user path and displays either its initialized workspace or setup flow without changing the installed shortcut

#### Scenario: Refresh an older repository auto-route
- **WHEN** an older auto-routed repository panel receives a top-level document refresh
- **THEN** it silently starts or reuses user mode on port 5180 and redirects the browser to the selected user workspace or setup flow

#### Scenario: Explicit repository launch remains fixed
- **WHEN** a panel was opened through the explicit repository launcher or workspace argument
- **THEN** that panel keeps its explicitly selected workspace and performs no auto-route redirect

#### Scenario: Running panel has another workspace
- **WHEN** port 5180 already serves a different workspace
- **THEN** auto routing refuses to open or change that running server; an explicit per-process port override remains available

## ADDED Requirements

### Requirement: Viewport-filling application header
The shared application header background and bottom edge SHALL fill the complete visible viewport width on Control Panel and Plugins Manager routes whenever the document does not need vertical scrolling. The root document SHALL reserve no permanent scrollbar gutter; the browser's normal vertical scrollbar MAY appear only when content exceeds the viewport. The layout SHALL introduce no horizontal scrolling.

#### Scenario: Empty Plugins Manager fits the viewport
- **WHEN** the Plugins Manager content is shorter than the viewport
- **THEN** no right-side gutter or visible vertical scrollbar remains and the shared header reaches the viewport edge

#### Scenario: Control Panel content exceeds the viewport
- **WHEN** the Control Panel content is taller than the viewport
- **THEN** the page uses the browser's normal vertical scrolling without introducing a horizontal scrollbar

### Requirement: Empty user project workspace
When an initialized ordinary user workspace contains no live, archived or unregistered projects, the Control Panel SHALL make project creation the focused next action. It SHALL open the existing New project dialog once when entering that empty state and focus a `Project name` input. The dialog SHALL include the one-sentence description `Create a new app project in your workspace.` and present `Letters, digits, spaces, and dashes.` as helper text below the input, preserve the entered project name including its casing and spaces, and derive its lowercase folder name automatically by replacing each whitespace run with a dash. Project-folder uniqueness SHALL be case-insensitive; a colliding name SHALL validate while the creation dialog remains continuously open, mark the input invalid and replace the reserved helper line with `A project with this name already exists.` in red using the same size, weight and line height, instead of resizing, closing, flashing, reopening or opening a generic error dialog. The project sidebar SHALL show a non-interactive `Projects` heading without active-tab styling, a counter, Archive tab or search, followed by the shared `No project yet.` placeholder and `+ New project` action using the same shared design-system add-action component as non-empty project lists, with centered action text and standard stack spacing, including while the creation dialog is open. The Project and Activity regions SHALL render no heading, card, dock or placeholder. The dialog SHALL include Cancel and allow Escape dismissal; the same `+ New project` action SHALL remain available after dismissal. Dialogs opened after a project exists SHALL retain the same Cancel behavior. Repository-development workspaces and non-empty project inventories SHALL retain their existing layouts.

#### Scenario: Open an empty user workspace
- **WHEN** the Control Panel loads an initialized ordinary user workspace with no project inventory
- **THEN** the New project dialog opens with its one-sentence description, the `Project name` input focused and character guidance below it, the plain counter-free `Projects` heading, `No project yet.` placeholder and `+ New project` remain visible in the project sidebar behind the dialog, while the Project and Activity regions are blank

#### Scenario: Dismiss first-project creation
- **WHEN** the New project dialog opens while the project inventory is empty and the user chooses Cancel or presses Escape
- **THEN** the dialog closes, the plain counter-free `Projects` heading, `No project yet.` placeholder and `+ New project` remain available in the project sidebar, and the Project and Activity regions remain blank

#### Scenario: Later project creation is optional
- **WHEN** at least one project exists and the user opens New project from the sidebar
- **THEN** the dialog includes Cancel and can be dismissed without creating another project

#### Scenario: Create a project name with spaces
- **WHEN** the user enters `My Project` in the Project name field and creates it
- **THEN** the visible app name remains `My Project` while its package and project folder use `my-project`

#### Scenario: Case-insensitive duplicate name
- **WHEN** a project folder already exists and the user enters the same name with any letter casing
- **THEN** the creation dialog never closes, flashes or changes height, and the input retains its entered value and active blue focus outline while only `A project with this name already exists.` replaces the helper copy in red with identical typography

#### Scenario: Create the first project
- **WHEN** the user creates a valid project from the empty-workspace dialog
- **THEN** the normal project list, project content and activity layout return with the new project selected

#### Scenario: Empty repository-development workspace
- **WHEN** an explicit repository-development workspace has no projects
- **THEN** the panel does not automatically open the ordinary-user first-project flow

### Requirement: Project selection recovery
When the project inventory is non-empty but the remembered selected project is absent, stale or belongs to an empty inventory view, the Control Panel SHALL select an available project, switch to that project's live or archived view, persist the repaired selection and render its project details. It SHALL NOT show the retired `No projects yet` instructional card while any project exists. When no project is selected, the project-detail region SHALL remain blank instead of restoring that retired card.

#### Scenario: Stale remembered project
- **WHEN** the browser remembers a project ID that is not present and the workspace contains Hello XR
- **THEN** Hello XR becomes selected, its containing Projects view opens and its details render

#### Scenario: Empty remembered inventory view
- **WHEN** Archive is remembered but contains no projects while live projects exist
- **THEN** the Control Panel switches to Projects and selects the first available live project

#### Scenario: No selected project
- **WHEN** no project can be selected
- **THEN** the detail region remains blank and the retired `No projects yet` instructional card is not rendered

### Requirement: Focused project-list affordances
Project-list empty placeholders SHALL use the shared design-system empty-note component, including `Nothing is archived yet.` and `Drag projects here.`. Context menus SHALL omit actions that are unavailable in the current context instead of rendering disabled menu items. The Control Panel SHALL install only the shared design-system tooltip behavior, so one hovered or focused control produces at most one tooltip. Projects and Archive SHALL use the shared compact tab component and its animated selection indicator, including when panel rendering replaces the tab-list DOM. Opening search SHALL preserve the flat inline search field, vertically align its search icon with the closed-state search action, and animate the shared indicator from the selected tab across the search row; closing search SHALL animate it back.

#### Scenario: Empty project section
- **WHEN** a named project section contains no projects
- **THEN** `Drag projects here.` uses the same shared empty-note component as the empty Archive view

#### Scenario: Section action is unavailable
- **WHEN** a section cannot move up, move down or be deleted
- **THEN** that action is absent from its context menu rather than shown disabled

#### Scenario: Show a control hint
- **WHEN** a tooltip-enabled control is hovered or focused
- **THEN** exactly one shared design-system tooltip is shown

#### Scenario: Switch project inventory tabs
- **WHEN** the user switches between Projects and Archive
- **THEN** the shared selection line animates from the previous tab to the selected tab

#### Scenario: Open and close project search
- **WHEN** the user opens or closes project search
- **THEN** the search icon remains vertically aligned, the input remains flat and inline, and the shared selection line expands to the full search row or contracts back to the selected tab with a transition

#### Scenario: Drag a live project to Archive
- **WHEN** the user drags a non-running project from the Projects list over the Archive tab and drops it
- **THEN** the Archive tab shows the shared primary drop-target treatment, the project is archived, Archive opens and the moved project remains selected

#### Scenario: Drag an archived project to Projects
- **WHEN** the user drags an archived project over the Projects tab and drops it
- **THEN** the Projects tab shows the shared primary drop-target treatment, the project is unarchived into its remembered section, Projects opens and the moved project remains selected

#### Scenario: Drag a running project to Archive
- **WHEN** the user drags a running live project over the Archive tab
- **THEN** the tab does not accept or highlight the drop because archiving a running project is unavailable

### Requirement: Shared developer-tool components
Reusable Control Panel and workspace-tool visuals and interactions SHALL be owned by the shared design system. Repeated control groups, button rows, field grids, supporting text, readouts, segmented controls, switches, compact toggles, sliders, disclosure headings, dialog structure, icon buttons, spinners, filter chips, swatches, tool buttons, empty overlays, floating-menu positioning and resumed component animation SHALL use named `xrb-*` components or modifiers. Product styles MAY position those components in feature-specific layout, but SHALL NOT duplicate their surface, typography, state, icon or interaction rules. Product markup and code SHALL use the shared icon library instead of embedding SVG presentation markup.

#### Scenario: Render a repeated visual pattern
- **WHEN** the Control Panel or Hand Tracking tool needs a visual pattern already used by another developer tool
- **THEN** it uses the shared component or adds a design-system modifier variant rather than defining a product-owned copy

#### Scenario: Position a floating menu
- **WHEN** a context or navigation menu opens near a pointer or anchor
- **THEN** shared bounded floating-position behavior keeps it inside the viewport

#### Scenario: Render a shared icon
- **WHEN** a developer-tool control needs a standard icon
- **THEN** the icon is supplied by the shared icon library and no product-owned inline SVG is added

#### Scenario: Mark the current developer tool
- **WHEN** the product menu marks Control Panel or Plugins Manager as the current page
- **THEN** its checkmark uses the shared primary accent color

### Requirement: Shared modal surface
Every Control Panel modal SHALL use the shared design-system dialog surface. The dialog itself SHALL not receive a browser focus outline when opened or clicked; controls inside it SHALL retain their normal focus treatment.

#### Scenario: Open or click a modal
- **WHEN** any Control Panel modal opens or the user clicks its surface
- **THEN** no white or browser-default outline appears around the modal card

### Requirement: Copyable generic errors
A generic Control Panel failure SHALL show the stable description `XR Build could not complete this action. Review or copy the details below.` followed by the complete raw error in a fixed-height monospaced shared copy area that remains visibly multiline for short errors and scrolls for long errors. The block SHALL provide one standard transparent shared icon-button action that writes the complete error text to the clipboard and receives the normal shared icon hover/focus treatment. It SHALL reserve one status line below the log and show `Copied to clipboard.` there after a successful copy without changing the dialog height. Generic error dialogs SHALL use the shared corner Close control and SHALL NOT render a bottom OK/action row. Raw process output SHALL NOT be repeated as prose or expand as an unbounded paragraph. Job output and generic errors SHALL reuse the same copy-block visual component.

#### Scenario: Report a process failure
- **WHEN** a panel action fails with multiline process output
- **THEN** the dialog remains bounded, shows the stable generic description without duplicating the raw error, keeps the complete raw output in a scrollable log and provides a standard copy-error-details icon action

#### Scenario: Copy error details
- **WHEN** the user activates the copy action in a generic error dialog
- **THEN** the clipboard receives the complete raw error text rather than only the generic description, `Copied to clipboard.` appears in the reserved line below the log, and the dialog does not jump or resize

### Requirement: Generated user-workspace package bootstrap
An ordinary panel-created user workspace SHALL create and refresh its generated pnpm lockfile when its installed package graph is absent or stale. The panel SHALL fingerprint the workspace package manifests after a successful install so adding a project or changing dependencies invalidates readiness even when the old lock and virtual-store lock still match. A dependency-bearing workspace package SHALL also be considered stale when its package-local `node_modules` links are absent, including when a previously deleted project is recreated with the same path and manifest. Setup for this mutable user workspace MAY use `--no-frozen-lockfile`. Explicit project repositories and repository-development workspaces SHALL continue to require a committed current lockfile and SHALL use `--frozen-lockfile`.

#### Scenario: Run Hello XR in a new user workspace
- **WHEN** a newly created ordinary user workspace has Hello XR but no `pnpm-lock.yaml` or installed package graph
- **THEN** the panel initializes the lockfile, installs the workspace dependencies and continues the requested run instead of failing with `ERR_PNPM_NO_LOCKFILE`

#### Scenario: Add a project to an installed user workspace
- **WHEN** an ordinary user workspace has a current installed graph and the panel creates another project with package dependencies
- **THEN** the package-manifest fingerprint becomes stale and the next run refreshes the generated lock and dependency links before starting the dev server

#### Scenario: Recreate an identical deleted project
- **WHEN** the user deletes and recreates a project with the same path and dependency manifest but its package-local dependency links are absent
- **THEN** the panel refreshes the workspace install before starting the project instead of reusing the matching manifest fingerprint alone

#### Scenario: Reinstall a user workspace with a lock
- **WHEN** an ordinary user workspace already has `pnpm-lock.yaml` but its installed package graph or package-manifest fingerprint is absent or stale
- **THEN** the panel refreshes that mutable user-workspace graph without requiring the user to run pnpm manually

#### Scenario: Explicit repository has no lock
- **WHEN** an explicitly selected project repository has no `pnpm-lock.yaml`
- **THEN** the panel retains the frozen-install requirement and reports the missing lock rather than silently creating one

### Requirement: In-place rebuild progress
Host rebuild progress SHALL use the shared progress-dialog presentation over the active Control Panel route. The active interface SHALL remain visible behind the modal scrim, and the dialog SHALL show the rebuild status and streamed output without a separate `XR Build` heading or opaque full-page setup backdrop.

#### Scenario: Rebuild host in place
- **WHEN** the user confirms Rebuild host
- **THEN** rebuild progress opens over the current Control Panel interface with no separate brand heading, while status and build output continue to update in the modal

### Requirement: Empty Plugins Manager
When no workspace plugins are installed, the Plugins Manager SHALL render the `Plugins` title and divider using the shared compact title/tab component, followed only by a shared `No plugins installed yet.` empty state in the Plugins sidebar. It SHALL hide the complete Details region, including the Details heading and `Select a plugin.` placeholder. A non-empty plugin inventory SHALL retain the normal list and selected-plugin details.

#### Scenario: No installed plugins
- **WHEN** the Plugins Manager loads an empty plugin inventory
- **THEN** the Plugins sidebar shows the shared `Plugins` title divider and `No plugins installed yet.`, and no Details heading or selection placeholder is present

#### Scenario: Plugin becomes available
- **WHEN** at least one plugin is installed and the inventory reloads
- **THEN** the normal Details region returns for the selected plugin
