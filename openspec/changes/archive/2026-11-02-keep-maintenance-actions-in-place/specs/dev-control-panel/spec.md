## ADDED Requirements

### Requirement: Tool maintenance navigation is explicit authorization
Choosing Restart or Rebuild from shared navigation SHALL be the explicit authorization for that action. Registered tools SHALL execute the selected maintenance action in place without navigating to Control Panel or presenting a second confirmation. Consumed legacy maintenance parameters SHALL execute once and SHALL NOT repeat on refresh.

#### Scenario: Rebuild from a registered tool
- **WHEN** the developer chooses Rebuild while a registered tool is active
- **THEN** the current tool route remains visible behind a shared progress dialog, rebuild starts without a confirmation dialog, and live status and bounded output remain visible until completion or failure

#### Scenario: Restart from a registered tool
- **WHEN** the developer chooses Restart while a registered tool is active
- **THEN** the current tool route remains visible behind the shared restart dialog and reloads only after the replacement panel is ready

#### Scenario: Legacy maintenance URL opened
- **WHEN** a maintenance navigation URL is opened
- **THEN** the requested action executes once after its parameter is removed and refreshing does not repeat it

## MODIFIED Requirements

### Requirement: In-place rebuild progress
Host rebuild progress SHALL use the shared progress-dialog presentation over the active Control Panel, Plugins Manager or registered tool route. The active interface SHALL remain visible behind the modal scrim, and the dialog SHALL show rebuild status and bounded streamed output without a separate `XR Build` heading, opaque full-page setup backdrop or confirmation step.

#### Scenario: Rebuild host in place
- **WHEN** the user chooses Rebuild from shared navigation
- **THEN** rebuild starts immediately and progress opens over the current interface while status and build output continue to update in the modal

## REMOVED Requirements

### Requirement: Tool maintenance navigation is not authorization
**Reason**: Choosing a named maintenance action in the shared menu is itself explicit user authorization; requiring a second confirmation forces registered tools to navigate away and duplicates the user's intent.

**Migration**: Intercept Restart and Rebuild on the active route, open the relevant shared progress dialog immediately, and retain one-shot handling for legacy maintenance URLs.
