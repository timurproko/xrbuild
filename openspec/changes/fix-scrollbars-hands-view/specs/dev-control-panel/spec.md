## ADDED Requirements

### Requirement: Visible-only functional scrollbar overlays

Shared enhanced scrollbars SHALL exist visibly and interactively only for visible, connected, genuinely overflowing usable regions. CSS-hidden/pending views, closed output details, removed regions and retired documents SHALL NOT leave inert or stale bars. Native overflow, accessible pointer/wheel/keyboard behavior, no-gutter layout and forced-colors fallback SHALL remain intact.

#### Scenario: Switch panel views

- **WHEN** the user switches from a scrolled Apps/Jobs view to Plugins, Settings or a pending destination document
- **THEN** outgoing hidden scroll regions leave no visible or interactive bars over the destination, and the destination gets only its own necessary scrollbars

#### Scenario: Switch Jobs and Log

- **WHEN** the user switches Jobs and Log or closes expanded job output
- **THEN** hidden lists/output have no overlay bars while the visible overflowing region keeps working scrolling and saved scroll state

#### Scenario: Jobs require scrolling

- **WHEN** a long Jobs list or expanded output exceeds its bounded viewport
- **THEN** wheel, track, thumb and keyboard controls move the intended connected region without duplicate or inert targets

#### Scenario: Jobs fit

- **WHEN** filtering, clearing, resizing or content changes leave a Jobs region without overflow
- **THEN** its scrollbar disappears without changing content width or reserving a gutter

#### Scenario: Page history restoration

- **WHEN** a document departs and returns through browser history
- **THEN** overlays restore only for current visible overflowing regions and do not retain retired-document capture state

### Requirement: Apps and Design scrollbar parity

Apps and Design Main SHALL share scrollbar geometry, viewport-edge behavior and input handling. Design Main SHALL NOT reserve an extra right-edge scrollbar gap through unnecessary preview framing. Intentional content padding and required isolated workflow frame bounds MAY remain. Short content SHALL have no visible scrollbar or permanent gutter.

#### Scenario: Compare normal scroll surfaces

- **WHEN** Apps and Design Main are viewed with overflowing content at the same viewport size and theme
- **THEN** their page scrollbars use the same shared geometry and edge inset without an additional Design-only gap

#### Scenario: Filter or resize Main

- **WHEN** component filtering or viewport resizing removes Main overflow
- **THEN** the unnecessary scrollbar disappears while layout width and shared header framing remain consistent

#### Scenario: Isolated workflow preview

- **WHEN** a Design workflow case uses an isolated frame
- **THEN** its intentional bounds and mocked actions remain intact, and its scrollbar uses the shared implementation rather than product-specific styling

### Requirement: Independent managed viewer availability

A managed tool supporting independent viewer serving SHALL open its current checked browser view despite optional service startup failure. Such failures SHALL appear inline instead of replacing the viewer with a centered Retry wall. Missing browser output SHALL use the normal shared shell with honest inline explicit setup/recovery, not claim readiness. Runtime ownership, required restart and explicit installation safeguards SHALL remain enforced.

#### Scenario: Declare independent viewer support

- **WHEN** a managed tool declares the neutral boolean `independentView` capability
- **THEN** missing current browser output uses the normal shared unavailable-view shell with inline explicit recovery, while unrelated tools keep their existing failure behavior

#### Scenario: Optional service fails

- **WHEN** a tool's current checked browser build is available but an optional service dependency is missing
- **THEN** its normal viewer and shared navigation open, unavailable service actions report inline failure, and the full view is not replaced with a blocking Retry card

#### Scenario: Browser build missing

- **WHEN** no current checked viewer build is available
- **THEN** the shared view shell exposes the missing prerequisite and explicit setup/recovery inline without silently installing dependencies or loading stale/foreign output
