## ADDED Requirements

### Requirement: Header run control and status

The Apps and Hands pages SHALL show Start and Stop as a single play or stop icon centred in the header, usable from every tab, disabled while starting or stopping, and a status chip after the header title naming the run state (Not started, Starting, Running, Stopping, Stopped) without ellipses. Fullscreen Hands SHALL move the icon and the frame-rate meters into the viewer, and its controls SHALL fade after a short idle time and return on input.

#### Scenario: Starting from another tab
- **WHEN** an app is selected and the Publish, Build or Settings tab is open
- **THEN** the header icon starts it with the remembered Develop choices

#### Scenario: Status after refresh
- **WHEN** the page reloads
- **THEN** the status chip appears only once the real run state is known, without a guessed label first

## MODIFIED Requirements

### Requirement: App settings saves do not move primary actions

App settings SHALL persist in the background without showing saving text or moving the Start action, which lives in the header. A failed save SHALL show short accessible error feedback, while retaining the existing safe retry and ordering behavior.

#### Scenario: Save pending or successful

- **WHEN** Display, Input or platform options change and a save is pending or succeeds
- **THEN** no saving message appears and the header Start action does not move

#### Scenario: Save fails

- **WHEN** a settings write fails
- **THEN** a short error is visible and accessible without shifting the Start action, and unsafe stale settings are not silently used
