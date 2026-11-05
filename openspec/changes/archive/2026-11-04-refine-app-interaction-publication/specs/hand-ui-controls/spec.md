## ADDED Requirements

### Requirement: Momentary segmented cap presentation
Segmented controls SHALL support an opt-in presentation where selected caps do not remain physically depressed. The showcase Full/X/Y/Z control SHALL use this presentation and ordinary radio selection without automatic re-selection fallback.

#### Scenario: Select an axis again
- **WHEN** the user activates the selected X, Y or Z with hand or mouse
- **THEN** selection stays unchanged and the cap returns to rest after release while remaining highlighted

#### Scenario: Restore full rotation
- **WHEN** the user activates Full
- **THEN** Full becomes selected and its cap returns to rest after release
