## MODIFIED Requirements

### Requirement: Start without a terminal
The panel SHALL start from a single launcher that shows no console window. The launcher opens the panel in the default browser. When a panel for the same workspace is already running on the selected port, the launcher opens that panel instead of starting a second server. A panel on the selected port for another workspace SHALL NOT be opened as though it served the requested workspace. When a shortcut launch finds that the selected port is held by a nonresponsive earlier panel process positively identified as originating from the same checkout and launcher mode, it SHALL stop that process, wait for the port to be released, and start a replacement. It SHALL NOT stop a responsive panel, a panel for another workspace, or an unrelated process.

#### Scenario: First start
- **WHEN** the developer runs the panel launcher and no panel is running on its selected port
- **THEN** the panel server starts with no visible console window and the browser opens the panel page

#### Scenario: Already running
- **WHEN** the developer runs the launcher while a panel for that workspace is already running on its selected port
- **THEN** the browser opens the running panel and no second server starts

#### Scenario: Different workspace on the selected port
- **WHEN** the developer runs the launcher while another workspace's panel is already running on its selected port
- **THEN** the launcher refuses to open that unrelated panel or change its workspace and reports the collision

#### Scenario: Stale shortcut process owns the port
- **WHEN** the developer runs a Start-menu launcher and its selected port is held by a nonresponsive panel process from that launcher's checkout and mode
- **THEN** the launcher stops only that process, waits for the port to be free, and opens a replacement panel

#### Scenario: Unknown port owner
- **WHEN** the developer runs a Start-menu launcher and an unrelated or unverified process holds its selected port
- **THEN** the launcher leaves that process running and reports the collision
