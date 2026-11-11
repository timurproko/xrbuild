## MODIFIED Requirements

### Requirement: Panel dialogs and controls
Confirmations, questions and messages SHALL use the panel's own dialogs, not the browser's alert, confirm or prompt. Buttons follow one style: secondary (raised, bordered), primary (filled accent) and danger (filled red), with the same hover (fill tinted, border highlighted) and pressed states for all. Dropdowns use the panel's own list. Light and dark SHALL follow the system theme by default, with an explicit System/Light/Dark choice in core settings that applies immediately and persists only in the browser. Shared palette, native control color-scheme and page identity SHALL follow that choice without workspace initialization or runtime-setting writes.

#### Scenario: Delete confirmation
- **WHEN** the developer chooses Delete on a project
- **THEN** a panel dialog asks for confirmation with equal-width Cancel and red Delete buttons

#### Scenario: Settings menu default
- **WHEN** the user opens Settings from the shared app menu after previously visiting a core or plugin section
- **THEN** All is selected whenever plugin settings are available, regardless of remembered browser selection; explicit module links still open their requested section across reload and route canonicalization, with a core-only fallback when no other settings exist

#### Scenario: Explicit panel appearance
- **WHEN** the user selects Light or Dark in core settings
- **THEN** panel routes and the same-origin design gallery use that theme despite the OS preference, preserve it on reload and synchronize open same-origin documents

#### Scenario: Default system appearance
- **WHEN** the saved theme is missing/invalid or the user selects System
- **THEN** the panel follows OS theme changes without writing workspace or runtime settings

#### Scenario: Unified controls and semantic colors
- **WHEN** shared controls are rendered in the panel, gallery or registered tools
- **THEN** maintenance menu captions retain normal foreground while only their bulbs carry status colors, Small is the single reduced control size, primary buttons do not stretch by default, error/warning banners share geometry and typography, and ranges use thumb-level keyboard focus instead of an outer rectangle

#### Scenario: Scroll without layout shift
- **WHEN** page or nested content overflows
- **THEN** shared enhanced scrollbars overlay content without reserving a gutter, retain pointer/wheel/touch/keyboard operation and accessible scrollbar semantics, and fall back to native scrolling when enhancement is unavailable or forced colors are active

#### Scenario: Readable physical display choices
- **WHEN** the panel enumerates connected physical screens
- **THEN** it maps active source/target identities to reported friendly names or confirmed built-in connection types, uses readable primary/numbered fallbacks when names are unavailable, and preserves routing identifiers and saved numeric selections instead of presenting raw GDI paths

## ADDED Requirements

### Requirement: Design system case gallery
The core SHALL provide a reusable gallery labeled Design at /design using the standard XR Build app bar/product menu and a case dropdown. Main SHALL collect the documented shared UI primitives with category navigation and interactive local-only examples; Install dependencies SHALL remain a separate case. The dropdown SHALL retain an accessible name without a visible Cases label; the header SHALL omit the simulated-components subtitle. Scenario choices SHALL use compact borderless shared rows with a subtle selected state. It SHALL retain scenario navigation without separate View/Theme/Width/Reload controls. The preview SHALL contain a neutral background and the dialog's dimming layer, not a fake app header or sample app. Installation/build interactions SHALL be in-memory simulations, with no delegation to real APIs and network/form restrictions on the preview.

#### Scenario: Developer-only menu entry
- **WHEN** the panel is started by the Dev shortcut or equivalent explicit repository-development CLI launch
- **THEN** its shared navigation metadata includes Design System immediately after Settings, before the separator and Restart/Rebuild, while normal user/auto launches do not; launch mode cannot be enabled by browser query or workspace tool registration, and no running panel is restarted to change that mode

#### Scenario: Gallery product navigation
- **WHEN** the developer opens the Design System product menu
- **THEN** it reads same-origin navigation metadata to provide the same app/registered-tool navigation and explicit Restart/Rebuild actions as other pages; Design System follows Settings before the maintenance separator, same-origin maintenance uses the shared in-place handlers, separate-origin previews return to the selected panel for maintenance, and case frames never send real API calls

#### Scenario: Shared component catalog
- **WHEN** a developer opens Design without selecting a case
- **THEN** Main shows the shared typography, actions, fields, navigation, status, dialog/progress, layout and media/output primitives, with interactive examples that never call real maintenance/install/device APIs

#### Scenario: Short links and compatibility
- **WHEN** the developer follows the Design or hand diagnostic menu entry
- **THEN** it uses /design or /hands/ respectively, while old document links redirect locally with their query preserved; plugin-owned legacy aliases remain bounded, collision-checked and unavailable when the plugin is unselected, without changing provider IDs or user storage

#### Scenario: Inspect dependency setup
- **WHEN** a developer chooses Install dependencies and a checklist or progress scenario
- **THEN** the real shared dialog is rendered with simulated data, inherits same-origin core appearance and fits the available browser width without installing software


### Requirement: Desktop setup checklist
Before a panel rebuild, read-only probes SHALL identify core desktop build-tool, native-library and runtime readiness. Missing prerequisites SHALL open an actionable checklist instead of starting a predictably failing build. Ready/Missing/Blocked/Installing/Restart required states and actionable blocked/failure reasons SHALL remain accessible. Browser-only use SHALL NOT require native setup. Optional plugin prerequisites SHALL remain separately owned.

#### Scenario: Grouped build tools
- **WHEN** toolchain checks are displayed
- **THEN** one foreground Build tools header contains the shared command-backed Install/Repair action above the compact CMake/compiler/SDK checks, with instructions and output shown once for the group rather than repeated per check; included labels use subordinate typography and statuses align right; both prerequisite cards share borders/padding and aligned heading/Install actions, omit routine descriptions and output links, and retain compact included checks; core native libraries is a compact title/status/action summary without an included-library description list; Install/Repair actions match status-tag sizing and typography, with Repair used for a partially installed toolchain and the bottom action row retains deliberate spacing

#### Scenario: Missing compiler tools
- **WHEN** the user chooses Rebuild without a usable CMake/compiler/desktop SDK
- **THEN** the checklist explains missing prerequisites and offers supported command-backed setup or a concrete blocked reason without creating a failed rebuild job

#### Scenario: Stable setup workflow order
- **WHEN** a prerequisite is installed or its readiness changes during refresh, reopen or browser reload
- **THEN** the row keeps its fixed prerequisite position: core native libraries first, then toolchain checks; completed rows are not moved to the bottom and no redundant Host runtime Missing row is shown before Rebuild

#### Scenario: Read-only recheck
- **WHEN** setup status is checked or refreshed
- **THEN** no packages are installed, dependencies downloaded, user folders initialized or project files changed

#### Scenario: Refresh in progress
- **WHEN** Refresh checks is reading prerequisite/job state
- **THEN** its button remains disabled and shows Checking... until success or failure, duplicate refresh/install/rebuild actions are prevented and the normal label/state is restored afterward

#### Scenario: Existing native tools
- **WHEN** a compatible toolchain is already installed outside the current PATH
- **THEN** supported explicit installation locations are probed before offering installation, without changing global PATH

### Requirement: Explicit bounded desktop installation
Desktop setup SHALL accept only fixed server-owned actions after explicit download/license/system-change consent and revision revalidation. System packages SHALL use an allowlisted trusted package-manager source with its normal integrity checks, or a fixed official HTTPS installer with valid provider Authenticode signature and checked download-to-execution hash continuity. The direct installer SHALL use fresh exclusive storage, bounded downloads, fixed components, normal system elevation and no automatic reboot. Native libraries SHALL retain pinned hashes. Setup SHALL stream bounded logs through shared progress/Jobs, recheck readiness and report failures/restart requirements truthfully. It SHALL NOT execute browser-supplied commands, bypass elevation or automatically reboot.

#### Scenario: Unconfirmed or stale setup request
- **WHEN** consent is absent, the action is unknown or the checked prerequisite revision has changed
- **THEN** setup is refused without starting a process or download

#### Scenario: Install in the background
- **WHEN** the user clicks Install or Repair for a supported missing prerequisite
- **THEN** that click supplies explicit consent without a separate checkbox or disclosure paragraph, and the fixed setup job streams progress without a terminal, while any required trusted system elevation prompt remains visible

#### Scenario: Output stays in progress and Jobs
- **WHEN** a setup job installed or attempted a prerequisite
- **THEN** its output remains available through shared progress and Jobs, while the prerequisite checklist shows no View setup output links or redundant description paragraphs

#### Scenario: Interrupted status request
- **WHEN** a read-only setup/job status request loses its connection
- **THEN** the UI retries that read a bounded number of times without repeating installation requests, recovers verified job outcomes when possible and otherwise shows concise reconnection guidance rather than claiming installation failed or is running

#### Scenario: Concurrent or interrupted setup
- **WHEN** another writer owns the setup lock or native work is active
- **THEN** conflicting setup/work is refused without deleting locks or interrupting the existing operation; active setup also blocks panel quit/restart

#### Scenario: Restart or failed installation
- **WHEN** an installer reports a restart requirement or failure
- **THEN** the UI preserves the result and actionable guidance, does not label the machine ready from exit code alone and never initiates a reboot; restart badges/progress remain visible without a duplicate red restart message in the checklist

#### Scenario: Missing system package manager
- **WHEN** Windows toolchain prerequisites are missing and the supported package manager cannot be used but system signature verification/elevation is available
- **THEN** the same explicit Install action downloads the fixed official bootstrapper, verifies its provider signature and hash continuity before execution, and streams its setup phases through the existing background job without installing a package manager

#### Scenario: Unsafe direct installer
- **WHEN** a bootstrapper download is oversized, redirected outside approved HTTPS hosts, linked, changed, unsigned or signed by another provider
- **THEN** it is never executed, failed state is preserved and an actionable failure reason is shown

#### Scenario: One command-backed installation flow
- **WHEN** supported toolchain prerequisites are missing or a toolchain installation failed
- **THEN** the Build tools header offers the same command-backed Install/Repair action and shared progress, without a separate manual-install state or website link

#### Scenario: Automatic setup is blocked
- **WHEN** neither automatic mechanism is available or prerequisite state is unsafe to change
- **THEN** setup is Blocked with a concrete reason in the checklist error area rather than offering another installation route, and resolving refresh checks clear that message
