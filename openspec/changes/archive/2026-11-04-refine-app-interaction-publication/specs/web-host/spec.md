## ADDED Requirements

### Requirement: Escape never automatically quits the host
The host SHALL forward Escape for app-shell navigation without invoking automatic fullscreen closure, including while no page is ready. Explicit window close and panel Stop SHALL retain graceful shutdown behavior.

#### Scenario: Direct app without an Escape handler
- **WHEN** Escape is pressed in a direct native app, with or without a usable SDK
- **THEN** the host remains open in fullscreen and windowed modes
