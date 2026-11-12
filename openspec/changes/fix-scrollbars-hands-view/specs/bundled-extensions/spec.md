## ADDED Requirements

### Requirement: Generated hand view independent of optional bridge startup

The public hand diagnostic SHALL serve its current checked generated view independently of optional bridge startup. Missing optional dependencies SHALL report unavailable support inline without a Retry page. Navigation SHALL NOT install, compile/download, capture, infer, record or consume private packages. Runtime receipts, origin/authentication checks and explicit setup/consent SHALL remain enforced.

#### Scenario: Missing bridge dependency

- **WHEN** the hand view's current checked browser output exists but an optional bridge dependency such as `ws` is unavailable
- **THEN** opening Hands displays the generated diagnostic and shared navigation instead of a centered startup-error card, with capture support unavailable inline

#### Scenario: Missing optional native runtime

- **WHEN** the diagnostic has no configured native runtime or model
- **THEN** generated viewing remains available and opening/navigation performs no native compilation, model download, camera capture or inference

#### Scenario: Explicit capture bootstrap

- **WHEN** the user explicitly requests an authorized capture-service action
- **THEN** optional dependencies are loaded only within the existing bounded authenticated path, and missing/unsafe state fails visibly without bypassing consent or silently substituting a device

#### Scenario: Current browser output unavailable

- **WHEN** the current checked browser build or public runtime is absent, stale, foreign, failed or linked
- **THEN** the normal shared shell shows inline explicit setup/recovery without claiming a ready diagnostic, executing private packages or adopting old-source output
