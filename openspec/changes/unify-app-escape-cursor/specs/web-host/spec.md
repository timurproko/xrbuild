## ADDED Requirements

### Requirement: Native Escape respects app shell context

The native presenter SHALL NOT unconditionally quit on Escape before the app shell resolves the action. Native shell routing SHALL use current-page launcher-return context and actual presentation fullscreen state. A direct fullscreen close SHALL use ordinary host cleanup. Windowed direct sessions SHALL remain open. A registered launcher-return action SHALL never also quit the host. Page replacement and reconnection SHALL NOT retain another page's stale shell action state.

#### Scenario: Fullscreen launcher child
- **WHEN** Escape is pressed while the current native-host page has a registered valid launcher return
- **THEN** the app returns to the launcher and the host remains running regardless of fullscreen state

#### Scenario: Direct fullscreen closure
- **WHEN** Escape is pressed in a direct fullscreen native app or launcher
- **THEN** the host completes its normal provider and presentation cleanup before exiting

#### Scenario: Direct windowed session
- **WHEN** Escape is pressed in a direct windowed native app or launcher
- **THEN** the presenter does not quit

#### Scenario: Page replacement
- **WHEN** a page disconnects and a different page registers shell context
- **THEN** Escape uses the new page's state and does not execute the previous page's pending action

#### Scenario: Fullscreen direct fallback
- **WHEN** a direct fullscreen native session has no usable SDK shell connection
- **THEN** Escape retains a graceful close path without timeout-closing a session already registered for launcher return
