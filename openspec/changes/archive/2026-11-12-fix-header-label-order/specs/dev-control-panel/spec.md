## ADDED Requirements

### Requirement: Header maintenance labels follow menu order

Header maintenance labels SHALL follow the logical order of their corresponding shared menu actions. Restart SHALL precede Rebuild while that is the menu order. DOM and visible order SHALL agree. Label state, captions, semantic colours, availability, actions and tool navigation SHALL remain unchanged; hidden labels SHALL reserve no placeholder space.

#### Scenario: Both maintenance labels visible

- **WHEN** restart and rebuild labels are both available
- **THEN** the header displays Restart before Rebuild, matching the shared menu in DOM and visual order

#### Scenario: Only one or no labels available

- **WHEN** status changes leave one or no maintenance labels visible
- **THEN** remaining labels retain their ordinary placement without empty placeholder slots or changes to their state/action meaning

#### Scenario: Refresh or switch panel views

- **WHEN** status refreshes or the user switches Apps, Plugins or Settings
- **THEN** the common header retains menu-consistent maintenance label ordering without invoking either action

#### Scenario: Registered hand-view header

- **WHEN** the approved hand diagnostic shows maintenance labels using the shared navigation model
- **THEN** those labels follow the same menu order and retain their existing status and explicit-action behavior
