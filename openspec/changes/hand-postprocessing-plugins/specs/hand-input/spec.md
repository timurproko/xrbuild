# Spec Delta

## ADDED Requirements

### Requirement: Optional mesh leaves hand input unchanged
A selected mesh post-processor SHALL consume only a copy of the final processed skeleton and SHALL NOT change source data, native signals, filtering, gestures or interaction. Mesh availability SHALL NOT gate hand input or app launch. Existing provider ABI and wire layouts SHALL remain unchanged.

#### Scenario: Any selected skeleton provider
- **WHEN** the same canonical poses arrive from different selected providers
- **THEN** optional mesh processing uses the same final-pose contract without a provider-specific branch

#### Scenario: Mesh fails during a grab
- **WHEN** a mesh processor crashes or becomes late during an active grab
- **THEN** skeleton interaction continues unchanged, without releasing or restarting the grab because of mesh failure
