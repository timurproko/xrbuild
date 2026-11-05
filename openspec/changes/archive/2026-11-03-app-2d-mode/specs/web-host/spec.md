# Spec Delta

## ADDED Requirements

### Requirement: Managed camera projection channel

The host SHALL accept an optional bounded initial managed-camera projection, Perspective or Orthographic, defaulting
to Perspective. It SHALL publish the current projection over the host channel to the page and to clients that connect
later. A control-panel channel client SHALL be able to change that projection while the app runs, independently of the
physical 2D/3D display view. Invalid options or channel payloads SHALL NOT change the current projection.

#### Scenario: Start Desktop in 2D

- **WHEN** the panel starts the desktop host with Orthographic managed-camera projection
- **THEN** the page receives Orthographic after connecting while the desktop display remains its normal mono view

#### Scenario: Change projection live

- **WHEN** the control panel changes a running host from Perspective to Orthographic
- **THEN** the host publishes Orthographic to the current page and retains it for a page reload without restarting the host

#### Scenario: Projection does not switch the display

- **WHEN** the host receives a camera-projection change without a view request on a switchable display
- **THEN** the physical display view remains unchanged

#### Scenario: Invalid projection request

- **WHEN** a channel client sends an unsupported projection value or malformed message
- **THEN** the host keeps the previous projection and continues serving the page

### Requirement: Active page window identity

The native host SHALL follow the active main page's title and favicon after navigation. A favicon delivered by CEF
SHALL replace the window and taskbar icons without restarting the host; an unavailable or invalid favicon SHALL leave
the previous icon intact.

#### Scenario: Launcher opens an app

- **WHEN** a native launcher navigates to a destination app with its own title and favicon
- **THEN** the existing host window updates both its title and icon to the destination app

#### Scenario: Favicon cannot be decoded

- **WHEN** the active page reports an unavailable or invalid favicon
- **THEN** the host keeps its current window icon and continues rendering the page
