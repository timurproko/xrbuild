## MODIFIED Requirements

### Requirement: In-place rebuild progress
Host rebuild progress SHALL use one shared rebuild-progress component over the active Control Panel, Plugins Manager or registered tool route. The active interface SHALL remain visible behind the modal scrim. Every route SHALL show the same status header and icons, bounded streamed output, dialog dimensions, footer layout, persisted Autoclose option, View job action and Close action without a separate `XR Build` heading, opaque full-page setup backdrop, confirmation step or reduced route-specific presentation.

#### Scenario: Rebuild host in place
- **WHEN** the user chooses Rebuild from shared navigation
- **THEN** rebuild starts immediately and the shared component opens over the current interface while status and build output continue to update in the modal

#### Scenario: Same dialog in every section
- **WHEN** the developer starts Rebuild from Control Panel, Plugins Manager or a registered tool
- **THEN** each route renders the same rebuild component with the same structure, sizing, status states, log and footer controls

#### Scenario: Autoclose on success
- **WHEN** Autoclose on finish is enabled and the rebuild succeeds
- **THEN** the dialog closes on every route and the saved preference is used the next time Rebuild opens from any route

#### Scenario: Failure remains visible
- **WHEN** a rebuild fails while Autoclose on finish is enabled
- **THEN** the shared component remains open with the failed status, complete bounded output and the standard View job and Close actions
