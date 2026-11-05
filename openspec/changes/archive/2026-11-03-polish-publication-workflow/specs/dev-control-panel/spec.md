## ADDED Requirements

### Requirement: Shared field validation presentation
Control Panel text, number and custom-dropdown fields SHALL use the shared design-system field validation presentation. Invalid controls SHALL retain their normal surface and focus treatment rather than receiving a red-filled background. The helper line SHALL retain the same size, weight and line height as ordinary field description text while using the semantic error color, and product styles SHALL NOT duplicate this behavior.

#### Scenario: Input validation error
- **WHEN** a text or number field fails validation
- **THEN** the control is identified as invalid without replacing its normal surface or active focus outline, and its helper description is replaced by same-sized red error text

#### Scenario: Dropdown validation error
- **WHEN** a custom dropdown fails validation
- **THEN** the dropdown uses the same invalid-state and helper-text presentation as an input rather than a product-specific error style

### Requirement: Publisher root route
An empty normalized publication slug SHALL select the configured publisher route-prefix root. The panel SHALL preserve the intentional empty value, present the complete root URL, and authorize Publish and Unpublish through the same validation, ownership, confirmation and status rules as a named route. A publisher that stores named routes below the same prefix SHALL change only files owned by the root publication and SHALL preserve every child route.

#### Scenario: Publish without an app slug
- **WHEN** the developer clears App slug and publishes to a publisher whose prefix is `apps`
- **THEN** the app is published at the complete `/apps/` URL and the empty slug remains selected

#### Scenario: Root route coexists with named routes
- **WHEN** the publisher already contains named routes and the developer publishes, republishes or unpublishes the root route
- **THEN** only root-owned files change and every named route remains intact

#### Scenario: Root route collision
- **WHEN** root app output would replace a named route or unrelated file not owned by the same publication
- **THEN** publication is refused before push and the existing public tree remains unchanged

## MODIFIED Requirements

### Requirement: Immediate publication completion
After a successful publication job, the panel SHALL immediately update the selected action and animate the complete publication result block, including its divider and deployment item, expanding for Publish or collapsing to nothing for Unpublish while publisher status converges. Ordinary status refreshes SHALL NOT replay the transition, and the animation SHALL respect reduced-motion preferences.

#### Scenario: Published deployment appears
- **WHEN** a Publish job completes successfully before publisher status has converged
- **THEN** the spinner stops, the action immediately becomes Unpublish, and the divider and provider block expand and fade into the deployment list while status refresh continues in the background

#### Scenario: Unpublished deployment disappears
- **WHEN** an Unpublish job completes successfully before publisher status has converged
- **THEN** the spinner stops, the action immediately becomes Publish, and the affected publication block visibly collapses and fades to nothing while other deployment blocks remain
