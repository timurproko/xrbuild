## ADDED Requirements

### Requirement: Return-only Escape navigation
The SDK SHALL handle Escape only to return an app with a validated launcher return destination. A direct app or Launcher SHALL remain open regardless of fullscreen state. Repeated keydown and disposed listeners SHALL NOT trigger additional actions. Browser-managed fullscreen behavior remains outside the SDK guarantee.

#### Scenario: Direct fullscreen launch
- **WHEN** Escape is pressed in a directly launched fullscreen app
- **THEN** the SDK neither requests session closure nor exits fullscreen

#### Scenario: Launcher child
- **WHEN** Escape is pressed in an app with a valid launcher return destination
- **THEN** it returns to Launcher once, in either fullscreen or windowed mode
