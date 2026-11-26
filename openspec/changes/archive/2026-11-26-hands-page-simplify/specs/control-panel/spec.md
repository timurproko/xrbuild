## ADDED Requirements

### Requirement: Hands input display label

The Apps Input dropdown SHALL display Hands for the existing hand-input option, including its selected summary and unavailable label. Its stored value SHALL remain `hand`; existing app settings and provider resolution SHALL remain compatible.

#### Scenario: Existing app uses hand input
- **WHEN** an app whose settings include `hand` opens in Apps
- **THEN** the dropdown option and summary say Hands and selecting it still saves `hand`

#### Scenario: Hand provider unavailable
- **WHEN** Apps retains a hand-input selection without an available provider
- **THEN** its display label says Hands with the existing unavailable indication rather than changing the saved value or silently removing it
