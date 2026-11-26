# Spec Delta

## MODIFIED Requirements

### Requirement: Preserve published signals and shared processing
Native and WebXR delivery SHALL enter shared processing without changing ABI/wire structures or default behavior. Original native gesture/palm fields and capabilities SHALL remain available as provenance. Explicitly enabled post-processing SHALL follow the common two-slot and signal-policy contract; with no stages, native-pinch/native-grab policy SHALL be unchanged. Managed input policy SHALL prevent WebXR injection when Hand is off or assigned to native.

#### Scenario: Native gesture compatibility
- **WHEN** a provider publishes native pinch, grab and palm capabilities with no post-processing enabled
- **THEN** those signals reach the existing SDK processing with unchanged native-pinch/native-grab policy and no extra filtering

#### Scenario: Managed Hand disabled
- **WHEN** a managed application without Hand enters an XR session
- **THEN** WebXR hand observations do not bypass that input policy

#### Scenario: Explicit skeleton refinement
- **WHEN** an enabled stage replaces a skeleton
- **THEN** the provider snapshot remains unchanged and the processed result follows the stage's declared coherent-native or derived signal policy before the single shared adjustment transform
