## ADDED Requirements

### Requirement: First-presentation Launcher icon readiness

Local Launcher cards SHALL show generated default 3D icons without requiring the destination app to run or build first. Authored models SHALL remain preferred where available. Icon presentation SHALL use live/disposed lifecycle state rather than scene attachment as a readiness test, retain default colour/compact sizing, and discard late completions safely. Custom images SHALL remain usable while authored models load.

#### Scenario: Fresh template project

- **WHEN** a new template app appears in Launcher before ever being launched or built
- **THEN** its card shows its generated default 3D icon in the selected colour instead of remaining as initials

#### Scenario: Synchronous icon during construction

- **WHEN** default geometry is created before its card is attached to the scene
- **THEN** the card retains and presents that geometry after attachment

#### Scenario: Built template app

- **WHEN** an already built template app appears in Launcher
- **THEN** it still shows its 3D icon without requiring another run, retaining the compact default scale and colour

#### Scenario: Authored icon without a custom bitmap

- **WHEN** an app provides an authored 3D icon but no custom PNG
- **THEN** its authored model remains preferred over generic generated geometry

#### Scenario: Card destroyed during load

- **WHEN** an asynchronous icon load completes after its card has been destroyed or replaced
- **THEN** no icon is attached to the stale card and unused resources are released

### Requirement: Bounded local authored-icon preparation

Local catalog entries SHALL expose checked authored-model readiness and stable output identity. Source-consuming preparation SHALL occur at explicit managed action boundaries, not catalog discovery GETs or destination app launch. Ready cards SHALL NOT trigger silent full builds through unpinned icon imports. Loading SHALL be deduplicated and visible when necessary; transient failures SHALL allow bounded recovery and retain usable fallback icons.

#### Scenario: Explicit catalog capability

- **WHEN** an app declares the neutral boolean `catalog` capability and is launched explicitly from the panel
- **THEN** required active library authored-icon preparation runs before opening it, while ordinary apps and catalog discovery GETs do not install or prepare other projects

#### Scenario: Cold authored icon

- **WHEN** an explicit local Launcher/preview action needs an authored icon whose required output is not prepared
- **THEN** required work is prepared through the managed writable build lane with visible progress before cards are considered ready, without launching the destination app or writing installed sources

#### Scenario: Prepared embedded icon

- **WHEN** a catalog entry has a checked generation-specific embedded icon model
- **THEN** Launcher imports that model and its dependent assets without navigating the unpinned app route or starting another hidden full build

#### Scenario: Metadata changes while Launcher remains open

- **WHEN** icon colour, model availability or checked output identity changes
- **THEN** catalog refresh updates icon presentation even if the app title and launch route did not change

#### Scenario: Model temporarily unavailable

- **WHEN** an authored icon fails to load and later becomes available
- **THEN** its card retains useful image/default fallback and can recover through bounded retry without requiring the destination app to run

### Requirement: Non-blocking ordinary settings saves

Ordinary setting edits SHALL persist per-project field intent without a routine Settings changed on disk modal. Saves SHALL be serialized/coalesced and use current complete revisions. Compatible stale edits SHALL rebase only intended fields with bounded retries, preserving unrelated changes. Unresolved conflicts and failures SHALL use shared inline feedback, retain unsaved intent where possible, and never silently claim a failed save succeeded.

#### Scenario: First embedded input edit

- **WHEN** the user changes input choices on an unmaterialized embedded project
- **THEN** safe working-state preparation and saving persist those choices without requiring a reload modal, and subsequent edits use authoritative revisions

#### Scenario: Rapid input changes

- **WHEN** the user toggles several input choices while an earlier save or catalog refresh is pending
- **THEN** the latest intended choices persist through reload without losing unrelated project settings or opening a reload modal

#### Scenario: Unrelated external edit

- **WHEN** a stale input/display/provider setting edit conflicts with an external change to another manifest field
- **THEN** only compatible user intent is reapplied to the current manifest and the unrelated external change is preserved

#### Scenario: Genuine same-field conflict

- **WHEN** another editor changed the same field and the pending edit cannot be safely rebased
- **THEN** the panel shows non-blocking inline conflict/retry information and preserves authoritative state and pending intent without silently overwriting another editor

#### Scenario: Busy or unsafe state

- **WHEN** a save is refused because of active operation locks, invalid provider schema, unsafe working state or a required publication confirmation
- **THEN** the refusal is not treated as a routine stale-revision retry, existing safeguards remain enforced, and a required publication confirmation is not bypassed

#### Scenario: Switch projects during a save

- **WHEN** a settings save completes after the user selects another project
- **THEN** its result updates only the original project's authoritative state and does not overwrite controls or pending choices in the newly selected project
