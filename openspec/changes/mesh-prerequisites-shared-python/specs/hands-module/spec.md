# Spec Delta

## ADDED Requirements

### Requirement: Start explains why it cannot run

Start SHALL stay clickable when the only obstacle is the provider choice: no available skeleton provider is chosen, the chosen one is unavailable, or it is an app-only provider. Clicking Start then SHALL start nothing and SHALL show a warning toast in the bottom-right corner with the reason and an action that opens Setup. The toast SHALL close by itself once Start can run, and its close button SHALL sit in the top-right corner, level with the title.

#### Scenario: No provider chosen
- **WHEN** the person clicks Start without an available skeleton provider selected
- **THEN** no session starts, a toast says to choose an available skeleton provider and offers Open Setup, and it closes once a usable provider is chosen
