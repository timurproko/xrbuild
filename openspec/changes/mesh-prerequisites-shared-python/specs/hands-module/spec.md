# Spec Delta

## ADDED Requirements

### Requirement: Blocked Start explains itself

When Hands has loaded and Start cannot be used because no available skeleton provider is chosen or the chosen provider is unavailable, the page SHALL show a lasting warning notice in the bottom-right corner with the reason and an action that opens Setup, and the disabled button SHALL carry the same reason. The notice SHALL update when the reason changes and close when Start becomes usable or the page closes.

#### Scenario: No provider chosen
- **WHEN** Hands opens without an available skeleton provider selected
- **THEN** Start is disabled, a notice says to choose an available skeleton provider and offers Open Setup, and it closes once a usable provider is chosen
