## ADDED Requirements

### Requirement: Explicit panel catalog in development runs

Panel-owned Browser and Desktop development Launcher runs SHALL carry validated selected-panel and current-project context and list that panel's eligible active apps. Refresh SHALL retain that selection and recover after local failures, reporting unavailability without substituting a published library. Packaged and published runs without explicit panel context SHALL retain publisher-owned inventory behavior.

#### Scenario: Desktop dev server

- **WHEN** the panel starts Launcher on Desktop with its dev server enabled
- **THEN** Launcher reads the selected panel's app library despite the dev server using a different loopback port, without requiring publication inventory at that server

#### Scenario: Browser dev server

- **WHEN** the panel starts Launcher in Browser development mode
- **THEN** the page receives validated panel/current-project context and lists the same eligible active app library in sidebar order, excluding itself

#### Scenario: Library refresh after local failure

- **WHEN** the selected panel library is temporarily unavailable and becomes readable again while Launcher remains open
- **THEN** Launcher reports local unavailability without substituting a published library, then refreshes from the same selected panel

#### Scenario: No panel context

- **WHEN** a packaged or published Launcher runs without explicit panel context
- **THEN** it keeps the existing publisher-owned inventory selection and does not probe an unrelated local panel

### Requirement: Bounded cross-origin local catalog reads

The panel SHALL allow its existing catalog, icon and preview read surface from validated HTTP(S) loopback development origins as well as the native `https://app.local` origin. Allowed responses SHALL reflect the accepted origin and vary by Origin. This permission SHALL NOT authorize other API routes, remote or malformed origins, cross-origin mutations or wildcard credential access. Existing Host validation and mutation-origin protections SHALL remain enforced.

#### Scenario: Local development catalog and assets

- **WHEN** a loopback development Launcher requests catalog, icon or preview resources from its selected panel using supported read methods
- **THEN** the panel supplies the bounded cross-origin read headers and the browser can read those resources

#### Scenario: Remote origin or mutation

- **WHEN** a remote or malformed origin requests local catalog access, or a development page attempts a cross-origin mutation
- **THEN** no catalog CORS write/general-API permission is granted and existing mutation protections remain enforced

#### Scenario: Native built run remains supported

- **WHEN** a panel-bound built Launcher reads catalog resources from `https://app.local`
- **THEN** existing native-origin catalog access remains available
