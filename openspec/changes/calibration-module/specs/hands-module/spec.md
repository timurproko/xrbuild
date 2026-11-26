# Spec Delta

## MODIFIED Requirements

### Requirement: Independent calibration boundary

Hands SHALL NOT contain a Calibration tab or camera calibration action. Camera calibration SHALL be available through the independent Calibration module at `/calibration/`, retaining its source, stored results and format validators. Its documented output SHALL identify a B-to-A camera transform bound to serials and profiles, not an app-hand adjustment; delivering the independent module SHALL NOT migrate or delete its data.

#### Scenario: Hands opened
- **WHEN** the user opens Hands
- **THEN** camera calibration is not offered as a Hands tab and no camera measurement is started

#### Scenario: Existing calibration retained
- **WHEN** the independent Calibration module replaces the removed viewer's calibration UI
- **THEN** persisted calibration keys and validated scalar formats remain readable and unchanged

#### Scenario: Future consumer documented
- **WHEN** another module consumes the documented calibration output
- **THEN** its contract requires current serial/profile/hash validation and does not imply app profile application, temporal synchronization or physical accuracy
