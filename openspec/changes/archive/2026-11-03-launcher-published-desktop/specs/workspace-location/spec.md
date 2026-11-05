# workspace-location Specification Delta

## ADDED Requirements

### Requirement: Launcher catalog runtime modes

The launcher SHALL treat only loopback browser origins as development previews. A launcher hosted by the native app runtime or at a published web origin SHALL read the configured publisher-owned inventory, retain each app's canonical published route, omit its own configured publication identity and show no synthetic empty slots. A loopback panel preview MAY use the selected project repository and a loopback development server MAY substitute local built routes; synthetic empty slots SHALL remain limited to those loopback environments.

#### Scenario: Native desktop mirrors published catalog

- **WHEN** the built launcher runs at a non-loopback native app origin
- **THEN** it shows the same valid publisher-owned entries as the published browser launcher and opens their canonical published URLs

#### Scenario: Native root omits launcher

- **WHEN** the native launcher is hosted at `/` and its path cannot identify its publication route
- **THEN** its compiled publication identity removes only its own inventory entry

#### Scenario: Published browser omits launcher

- **WHEN** the launcher runs at its named published route
- **THEN** path and publication identity filtering omit the launcher while retaining every other valid publication

#### Scenario: Test slots are loopback-only

- **WHEN** the launcher runs in a panel preview or separate development server on `localhost` or `127.0.0.1`
- **THEN** test-only empty slots may be appended for catalog layout testing

#### Scenario: Product runtime has no test slots

- **WHEN** the launcher runs in the native app runtime or from a published HTTPS origin
- **THEN** no synthetic empty slot is shown, including when the real inventory is unavailable

### Requirement: Launcher pointer presentation

The launcher SHALL support its existing mouse and hand interactions without rendering the SDK's spatial mouse cursor ring in the scene. Other applications and the SDK cursor capability SHALL remain unchanged.

#### Scenario: Mouse control without cursor ring

- **WHEN** a desktop user moves and clicks the mouse over launcher cards or page controls
- **THEN** the controls retain their hover, press and activation behavior without a separate white or blue spatial ring flashing over the catalog

#### Scenario: Hand interaction remains available

- **WHEN** the launcher receives supported hand input
- **THEN** card and page controls remain interactive after the launcher-specific mouse cursor object is removed
