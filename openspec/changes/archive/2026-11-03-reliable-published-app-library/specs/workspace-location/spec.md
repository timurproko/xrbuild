## MODIFIED Requirements

### Requirement: Local catalog in an embedded project preview
When the panel serves a launcher project's browser preview, the launcher SHALL list available apps from that panel's selected project repository, without requiring the production publication inventory. A published launcher SHALL continue to read its configured publication inventory. The published inventory SHALL support both the publisher route-prefix root and named child routes; the launcher SHALL omit only its own canonical route and show every other valid published entry. Catalog cards SHALL use a valid same-origin manifest icon when available and otherwise use the finalized project favicon supplied by the browser build.

#### Scenario: Production inventory is unavailable during local preview
- **WHEN** a local browser preview opens while the production inventory is missing
- **THEN** its cards show eligible apps from the selected project repository and launch through local panel preview routes

#### Scenario: Published catalog
- **WHEN** the launcher runs at its published origin
- **THEN** it lists routes from the publisher-owned inventory and does not use the development panel API

#### Scenario: Launcher published at the route-prefix root
- **WHEN** the inventory contains the launcher at `/apps/` with an empty slug and other apps at named child routes
- **THEN** the launcher omits its own root entry and shows every valid named app instead of reporting the library unavailable

#### Scenario: Launcher published at a named route
- **WHEN** the launcher runs at `/apps/launch/` and the inventory also contains a root publication and other named apps
- **THEN** it omits only `/apps/launch/` and shows the root and remaining named publications

#### Scenario: App has no manifest icon
- **WHEN** a published app has no usable same-origin icon in its web manifest
- **THEN** its catalog card uses the finalized `xrb-app-icon.png` from that app's published route
