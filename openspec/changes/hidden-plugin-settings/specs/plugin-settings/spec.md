# Spec Delta

## Purpose

Defines how plugin preference fields appear in Settings and how saved and effective values retain their meaning when a field is hidden.

## ADDED Requirements

### Requirement: Field visibility metadata is bounded and optional
Runtime `settings` and `panel.settings` fields SHALL accept an optional boolean `hidden` flag. Only true SHALL hide a field. Missing or false SHALL retain existing behavior. Non-boolean flags SHALL be rejected, and the separate `config` schema SHALL NOT accept this flag.

#### Scenario: Both preference scopes accept the flag
- **WHEN** a plugin declares hidden and visible fields in runtime and panel settings
- **THEN** its metadata retains hidden field declarations, types and defaults and exposes their presentation flag

#### Scenario: Invalid metadata is refused
- **WHEN** a field declares a non-boolean hidden flag, or a config field declares the flag
- **THEN** the plugin metadata is rejected without creating or changing preferences

### Requirement: Hidden fields do not produce settings controls or save payload entries
Settings SHALL omit hidden fields before generating controls, headings, section dividers and preference forms in both scopes. A wholly hidden section or scope SHALL produce no heading, orphan divider or empty preference form. Autosave SHALL read and submit only visible fields, without requiring hidden controls or submitting hidden defaults or cached values.

#### Scenario: Mixed and wholly hidden groups
- **WHEN** a plugin has hidden-only sections, mixed sections, a hidden-only runtime scope and visible panel fields
- **THEN** only visible controls and their nonempty headings appear, in their existing order, with no leading divider caused by the hidden runtime scope

#### Scenario: A visible edit does not need hidden inputs
- **WHEN** a user changes a visible field while hidden controls are absent
- **THEN** saving succeeds and its preference payload contains only visible field values

#### Scenario: Fields without the flag are unchanged
- **WHEN** a plugin omits hidden metadata or declares hidden false
- **THEN** Settings retains its existing controls, order, labels, hints, values and saving behavior

### Requirement: Omitted hidden preferences survive visible saves
A preference write SHALL preserve stored values of declared hidden fields omitted by the request, using the current owned record within the existing locked update. It SHALL preserve false and empty strings without materializing absent defaults. Explicitly supplied hidden values SHALL be validated normally and override preserved values; invalid writes SHALL leave the preference file unchanged. Visible-field replacement semantics SHALL remain unchanged.

#### Scenario: Missing defaults stay unsaved
- **WHEN** a user browses Settings and saves a visible edit with no hidden values previously stored
- **THEN** browsing creates no preference file and saving does not persist hidden defaults

#### Scenario: False and empty strings survive repeated edits
- **WHEN** stored hidden values include false, empty strings and custom text and a visible field is saved, reloaded and saved again
- **THEN** those exact hidden values remain in the saved record and effective settings in both preference scopes

#### Scenario: A stale page omits fields changed by another writer
- **WHEN** another writer changes hidden values after a form loads and the old page later saves visible values without those hidden entries
- **THEN** the latest stored hidden values survive rather than being erased or replaced by cached page values

#### Scenario: Explicit hidden writes still work
- **WHEN** an API caller explicitly submits valid hidden values
- **THEN** those values override the preserved values

#### Scenario: Invalid hidden writes are refused atomically
- **WHEN** an API caller submits a hidden value with an invalid type, option or numeric bound
- **THEN** the write is rejected and existing preference bytes remain unchanged

### Requirement: Hidden preference preservation respects source ownership
Hidden-value preservation SHALL follow existing origin-qualified preference ownership and eligible legacy fallback in both preference scopes. It SHALL NOT borrow values from another origin or an ineligible legacy record. Unrelated plugins, preference scopes and other preference data SHALL remain unchanged.

#### Scenario: Qualified values take priority
- **WHEN** the selected source has its own qualified record and an eligible legacy record also exists
- **THEN** only the qualified record supplies hidden values, without merging missing entries from the legacy record

#### Scenario: Eligible legacy values seed a qualified save
- **WHEN** a source without a qualified record is eligible for legacy fallback and a visible save creates its qualified record
- **THEN** the saved qualified record includes the omitted hidden values from that eligible legacy record and leaves unrelated records intact

#### Scenario: Conflicting sources remain isolated
- **WHEN** duplicate sources exist and the selected source is not eligible for unqualified legacy preferences
- **THEN** a visible save neither imports another source's hidden values nor changes its saved record, and unresolved source conflicts remain refused

### Requirement: Hiding does not change effective runtime configuration
Hidden runtime fields SHALL remain declared and subject to the same value validation and precedence as visible fields: schema defaults, owned saved values, project overrides, then host command-line overrides. Presentation metadata SHALL NOT suppress hidden values from generated launch configuration or weaken validation of explicit values.

#### Scenario: Defaults and saved values are presentation-independent
- **WHEN** equivalent field schemas differ only by hidden flags and are evaluated with no saved values or valid custom saved values
- **THEN** their effective settings are identical, including false and empty strings

#### Scenario: Project and command-line overrides retain priority
- **WHEN** a hidden runtime field has a default, saved value, project override and explicit command-line override
- **THEN** generated launch configuration uses the project value over the saved value and the host configuration merge applies the command-line value last
