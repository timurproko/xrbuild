## ADDED Requirements

### Requirement: Consistent app Escape action

The shared SDK app runtime SHALL resolve Escape once: return to a validated launcher first; otherwise close only an owned fullscreen session. Windowed direct apps SHALL remain open. Launcher SHALL follow the same direct-app policy. The runtime SHALL suppress repeated or duplicate in-flight actions and remove its handler on disposal.

#### Scenario: Return from a launcher child
- **WHEN** Escape is pressed in a Desktop or Browser app with a validated launcher return, in either window mode
- **THEN** it returns to that launcher without closing the owned session and preserves projection, Mouse selection, and cursor style

#### Scenario: Direct fullscreen app or launcher
- **WHEN** Escape is pressed in a directly opened app or launcher in an owned fullscreen session
- **THEN** it requests graceful closure of only that session

#### Scenario: Direct windowed app or launcher
- **WHEN** Escape is pressed in a directly opened app or launcher in a windowed session
- **THEN** the shell neither closes the session nor navigates away

#### Scenario: Browser page outside a managed session
- **WHEN** a directly opened ordinary browser page has no window-ownership adapter
- **THEN** the SDK does not attempt to force-close its tab and permits normal browser Escape exit from fullscreen

#### Scenario: Invalid or repeated navigation
- **WHEN** a return destination is invalid or an Escape action is already in progress
- **THEN** the SDK does not navigate to an unvalidated destination or execute a second shell action

### Requirement: Shared configurable mouse cursor

The SDK SHALL provide System, Ring, and Ring with hover dot modes, defaulting to the latter. It SHALL display only the selected cursor and show a center dot only in Ring with hover dot over enabled interactive targets. Cursor style SHALL NOT override disabled Mouse input. Launcher navigation SHALL preserve the selected mode.

#### Scenario: Default hover feedback
- **WHEN** an enabled mouse moves from empty space onto an enabled interactive target using the default style
- **THEN** the ring gains a center dot and loses it when it leaves the target or the target becomes disabled

#### Scenario: Ring without a dot
- **WHEN** Ring mode is selected and the pointer hovers an interactive target
- **THEN** the ring retains shared size and press feedback but has no center dot

#### Scenario: System pointer
- **WHEN** System mode is selected for a Mouse-enabled app
- **THEN** the host or browser pointer is visible and no SDK ring is drawn, including after a mono/stereo change

#### Scenario: Mouse disabled
- **WHEN** Mouse is not selected at launch
- **THEN** no cursor mode enables mouse binding or app-surface mouse feedback

#### Scenario: Style persistence and cleanup
- **WHEN** an app launches another app through the shared launcher API and later returns or disposes its runtime
- **THEN** launch/return preserves cursor style and disposal removes rendered-cursor state and restores any browser canvas cursor style it changed
