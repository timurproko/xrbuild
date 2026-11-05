## ADDED Requirements

### Requirement: Panel freshness check
The panel SHALL record when its process started and check whether any server code it loaded has changed since: the
core's panel server sources and the folders of the workspace packagers and publishers it loaded. Panel UI files,
read on every request, SHALL NOT count. When something changed, the top bar shows a "restart available" chip naming
the newest changed file, and the menu's Restart control panel item shows the same dot as Rebuild host; both appear
only while the panel is outdated.

#### Scenario: Code changed after the panel started
- **WHEN** a pull or an edit changes a panel server source file or a loaded workspace publisher after the panel started
- **THEN** the top bar shows "restart available" naming that file, and Restart control panel shows a dot

#### Scenario: Restart loads the new code
- **WHEN** the developer chooses Restart control panel while it is outdated
- **THEN** the panel restarts with the new code and, after the page reloads, neither the chip nor the dot is shown

#### Scenario: Only the panel UI changed
- **WHEN** only a file under the panel's UI folder changed after the panel started
- **THEN** no restart is suggested; reloading the page shows the change
