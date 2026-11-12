## MODIFIED Requirements

### Requirement: Focused project-list affordances

Project-list empty placeholders SHALL use the shared design-system empty-note component, including `Nothing is archived yet.`. Empty named and Unsorted sections SHALL NOT render headings or `Drag projects here.` placeholders in the normal sidebar; a temporary inline section editing interaction MAY remain visible. Context menus SHALL omit actions that are unavailable in the current context instead of rendering disabled menu items. The Control Panel SHALL install only the shared design-system tooltip behavior, so one hovered or focused control produces at most one tooltip. Projects and Archive SHALL use the shared compact tab component and its animated selection indicator, including when panel rendering replaces the tab-list DOM. Opening search SHALL preserve the flat inline search field, vertically align its search icon with the closed-state search action, and animate the shared indicator from the selected tab across the search row; closing search SHALL animate it back.

#### Scenario: Empty project section

- **WHEN** a named project section contains no projects and is not being edited
- **THEN** the sidebar hides that section instead of showing a heading and `Drag projects here.` placeholder

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

## ADDED Requirements

### Requirement: Unified nonempty sidebar sections

The Projects sidebar SHALL combine embedded and user projects into one group per case-insensitive section name, retaining qualified identities and saved order. It SHALL show one trailing Unsorted group only when occupied. Empty groups SHALL be hidden without deleting organization or moving product sources. Temporary inline section editing MAY remain visible. Hiding groups SHALL preserve correct action targets.

#### Scenario: Mixed-origin Unsorted

- **WHEN** an embedded app and a user app have no named section
- **THEN** both appear under one trailing Unsorted heading in the sidebar, not separate origin-specific headings

#### Scenario: Mixed-origin named section

- **WHEN** embedded and user projects belong to the same logical section with differently cased section names
- **THEN** one heading contains all those projects, retaining each project's qualified identity and effective saved order after reload

#### Scenario: Empty Unsorted

- **WHEN** every active project belongs to a named section
- **THEN** no Unsorted heading or empty drop placeholder is displayed

#### Scenario: Empty saved section

- **WHEN** a stored named section has no active projects and is not being edited
- **THEN** it is hidden without deleting its saved organization, and other section context menus and drag operations still target the intended sections

#### Scenario: Create a section

- **WHEN** the developer starts creating a section
- **THEN** the inline naming interaction remains usable and a completed section with no active projects is hidden until occupied

#### Scenario: Empty active library

- **WHEN** there are no active projects
- **THEN** the sidebar shows its existing appropriate empty-library/create-project affordance without empty section headings

### Requirement: Local Launcher shares effective sidebar order

A panel-bound Launcher SHALL list eligible active embedded and user apps in the sidebar's effective section/item order regardless of source origin or publication configuration. It SHALL omit its own logical project identity, archived projects and ineligible entries, and SHALL NOT create duplicate section-origin catalogs.

#### Scenario: Unconfigured embedded Launcher

- **WHEN** the embedded Launcher without a publication identity runs from the panel in development mode
- **THEN** it lists eligible embedded and user apps in sidebar order, excludes itself and archived/ineligible projects, and uses local panel preview routes
