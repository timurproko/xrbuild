## MODIFIED Requirements

### Requirement: Auto-routing Start shortcut
The auto-routing Start-menu launcher SHALL always select the user workspace named by `XRB_HOME`, else `%USERPROFILE%\.xrbuild`, on port 5180. A missing, empty or otherwise uninitialized selected directory SHALL open the normal panel without requiring workspace setup, even when the current checkout contains its own `.xrbuild/`. Repository development SHALL remain available only through its explicit launcher or workspace argument. Top-level browser refreshes from an older auto-routed repository panel SHALL silently start or reuse the selected user panel and redirect there without mutating either server's workspace. Launch and read-only browsing SHALL NOT initialize or remove workspace folders.

#### Scenario: Absent user directory
- **WHEN** the selected user `.xrbuild` directory does not exist and the checkout contains its own `.xrbuild/`
- **THEN** the shortcut opens user mode on port 5180 without creating that directory, requesting setup or falling back to repository projects

#### Scenario: Existing empty user directory
- **WHEN** the selected user `.xrbuild` directory exists but is empty or uninitialized
- **THEN** the shortcut opens the normal panel without setup or initialization writes and does not treat the checkout workspace as a fallback

#### Scenario: User environment precedence
- **WHEN** `XRB_HOME` names a missing, empty or initialized workspace
- **THEN** the shortcut selects that path in user mode and opens the panel without requiring workspace creation

#### Scenario: Home default
- **WHEN** `XRB_HOME` is unset and `%USERPROFILE%\.xrbuild` is initialized
- **THEN** the shortcut opens that ordinary user workspace

#### Scenario: No embedded workspace
- **WHEN** the selected user workspace directory and the checkout's private workspace are both absent
- **THEN** the shortcut opens the normal panel on the selected user path, showing available public embedded apps or the empty project state without mandatory setup

#### Scenario: Toggle without reinstalling
- **WHEN** the developer creates or removes the selected home workspace directory between shortcut launches
- **THEN** the next launch continues to select that user path and opens the panel without changing the installed shortcut or initializing missing folders

#### Scenario: Refresh an older repository auto-route
- **WHEN** an older auto-routed repository panel receives a top-level document refresh
- **THEN** it silently starts or reuses user mode on port 5180 and redirects the browser to the normal panel for that selected user path

#### Scenario: Explicit repository launch remains fixed
- **WHEN** a panel was opened through the explicit repository launcher or workspace argument
- **THEN** that panel keeps its explicitly selected workspace and performs no auto-route redirect

#### Scenario: Running panel has another workspace
- **WHEN** port 5180 already serves a different workspace
- **THEN** auto routing refuses to open or change that running server; an explicit per-process port override remains available

### Requirement: Empty user project workspace
When an ordinary user workspace is missing, empty or uninitialized and contains no live, archived or unregistered projects, the Control Panel SHALL make project creation available without automatically opening a dialog. The project sidebar SHALL show a non-interactive `Projects` heading without active-tab styling, a counter, Archive tab or search, followed by the shared `No project yet.` placeholder and `+ New project` action using the same shared design-system add-action component as non-empty project lists, with centered action text and standard stack spacing. The Project and Activity regions SHALL render no heading, card, dock or placeholder. Only choosing New project SHALL open the existing creation dialog and focus its `Project name` input. The dialog SHALL include `Create a new app project in your workspace.` and `Letters, digits, spaces, and dashes.` helper text, preserve the entered name including casing and spaces, and derive its lowercase folder by replacing whitespace runs with a dash. Project-folder uniqueness SHALL remain case-insensitive; collisions SHALL validate in the continuously open dialog with `A project with this name already exists.` replacing the reserved helper line in red without resizing, flashing or changing typography. Cancel and Escape SHALL dismiss creation without creating files. Non-empty inventories, including public embedded apps, SHALL retain their normal project layout regardless of whether the user folder has been initialized.

#### Scenario: Open an empty user workspace
- **WHEN** the panel loads an absent, empty or initialized ordinary user workspace with no project inventory
- **THEN** the plain counter-free Projects heading, No project yet. and + New project are visible without an open setup or creation dialog, while Project and Activity remain blank

#### Scenario: Explicitly open first-project creation
- **WHEN** the user chooses + New project in an empty workspace
- **THEN** the creation dialog opens with its one-sentence description, focused Project name input and character guidance, without initializing the workspace yet

#### Scenario: Dismiss first-project creation
- **WHEN** the user chooses Cancel or presses Escape in New project
- **THEN** the dialog closes, the empty sidebar action remains available and the selected folder remains unchanged

#### Scenario: Later project creation is optional
- **WHEN** at least one project exists and the user opens New project from the sidebar
- **THEN** the dialog includes Cancel and can be dismissed without creating another project

#### Scenario: Create a project name with spaces
- **WHEN** the user enters My Project and confirms creation
- **THEN** the visible name remains My Project while its package and project folder use my-project

#### Scenario: Case-insensitive duplicate name
- **WHEN** a project folder exists and the user enters the same name with any casing
- **THEN** the creation dialog retains its value, focus and geometry and shows the inline duplicate-name error rather than closing or opening a generic error dialog

#### Scenario: Create the first project
- **WHEN** the user explicitly confirms a valid template project in the empty workspace
- **THEN** the normal project list, content and activity layout return with only the requested new app added and selected

#### Scenario: Empty repository-development workspace
- **WHEN** an explicit repository-development workspace has no projects
- **THEN** the panel opens normally without automatically opening workspace setup or first-project creation

## ADDED Requirements

### Requirement: Lazy workspace initialization
The panel SHALL initialize missing package-workspace scaffold only when template project creation is confirmed, adding only the requested app without a companion starter. Scaffolding SHALL preserve existing files and respect separate project/integration roots. Invalid or colliding project names SHALL be refused before initialization. Other explicit writable actions MAY create their required user-owned state without workspace setup; writable-path and dependency-install safeguards SHALL remain unchanged.

#### Scenario: Create in a missing combined workspace
- **WHEN** the user confirms a template project in a missing combined workspace
- **THEN** the selected root receives missing standard workspace/package files, editor mapping and the requested app, with no extra starter app or Git metadata

#### Scenario: Separate project root
- **WHEN** template creation targets a separate project repository
- **THEN** only the project root receives project-only scaffold and the requested app, without initializing integration folders or overwriting existing root files

#### Scenario: Embedded writable action before template creation
- **WHEN** the user explicitly saves an embedded app setting or requests a build before creating any personal template project
- **THEN** its necessary writable working/configuration/build state is prepared lazily without requesting workspace setup or generating a starter app, and product sources remain unchanged

#### Scenario: Browse direct panel routes
- **WHEN** the user visits Apps, Plugins or Settings with an uninitialized selected root
- **THEN** that route opens normally and may display available embedded content without a setup overlay, project-creation prompt or workspace initialization writes

#### Scenario: Unsafe destination
- **WHEN** a write targets a linked root or embedded product source
- **THEN** the existing ownership checks refuse it without modifying linked targets or installed sources
