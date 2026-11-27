# Spec Delta

## ADDED Requirements

### Requirement: Final sampled observation provenance
Final sampled hands SHALL expose optional copied per-joint acquisition confidence, observation support and age for geometry consumers. Scores SHALL retain provider meaning; unsupported or unknown evidence SHALL not become confident through smoothing or prediction. Age SHALL refer to the requested sample time on the mapped capture clock. Adding metadata SHALL not change coordinates, validity, gestures, native flags, filtering or provider ABI/wire layouts.

#### Scenario: Same input with optional geometry enabled
- **WHEN** the same partial-confidence hand sequence is processed with None, healthy, preparing or failed mesh processing
- **THEN** final coordinates, gestures, pointer events and held interactions remain identical, while capable mesh consumers can inspect aligned observation evidence

#### Scenario: Unsupported joint and prediction
- **WHEN** a previously supported joint now has zero confidence while other joints keep the hand valid
- **THEN** the current score/support identifies that lack of observation and the last supported observation ages rather than resetting to the prediction time

#### Scenario: Identity retirement
- **WHEN** a hand or consumer epoch is retired and its numeric hand ID is later reused
- **THEN** prior joint-support history is not assigned to the replacement hand

#### Scenario: Existing custom Hand producer
- **WHEN** older application code creates a Hand without the optional metadata
- **THEN** it remains source-compatible and existing interaction works, while new consumers identify observation evidence as unknown rather than fabricated
