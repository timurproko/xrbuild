## MODIFIED Requirements

### Requirement: Host freshness check
The panel SHALL check whether the `xrb-host` build and the build of every workspace plugin exist and whether one is older than its newest source file. The host SHALL use its build-system record of the last successful build. Each workspace plugin SHALL use the newer of its built library and a panel-owned record written only after that plugin's build completes successfully, so a successful build that does not relink an unchanged library still becomes current while a failed build does not. Plugins left next to the host by an older build SHALL also make the host outdated. The top bar SHALL show a chip and a Rebuild host button only when something is missing or outdated. The panel SHALL warn before a package build with an outdated host.

#### Scenario: Outdated host
- **WHEN** a host or workspace plugin source file was changed after its last successful build
- **THEN** the top bar shows the host as outdated, and a package build asks for confirmation first

#### Scenario: Plugins left next to the host
- **WHEN** the host's build folder still holds plugins installed there by an older build
- **THEN** the top bar shows the host as outdated, and Rebuild host removes those plugin folders

#### Scenario: Rebuild host
- **WHEN** the developer clicks Rebuild host while no host is running and every build completes successfully
- **THEN** the host and then every workspace plugin are rebuilt with the output streamed live as a job, and the chip and menu indicator disappear on success and remain absent after refresh

#### Scenario: Successful plugin build without relinking
- **WHEN** a workspace plugin source input is newer than its DLL but the requested rebuild succeeds without rewriting that DLL
- **THEN** the successful-build record makes the plugin current and the panel no longer requests another rebuild

#### Scenario: Failed plugin build
- **WHEN** a workspace plugin rebuild fails after its sources changed
- **THEN** no successful-build record is advanced for that plugin and the rebuild indication remains visible

### Requirement: Panel freshness check
The panel SHALL record an identity for each running process and check whether any server code it loaded has changed since startup: the core's panel server sources and the folders of the workspace packagers and publishers it loaded. Panel UI files, read on every request, SHALL NOT count. When something changed, the top bar SHALL show a `restart available` chip naming the newest changed file, and the menu's Restart control panel item SHALL show the same dot as Rebuild host; both SHALL appear only while the panel is outdated. Restart recovery SHALL wait for a different panel identity at the configured origin rather than relying only on a process ID.

#### Scenario: Code changed after the panel started
- **WHEN** a pull or an edit changes a panel server source file or a loaded workspace publisher after the panel started
- **THEN** the top bar shows `restart available` naming that file, and Restart control panel shows a dot

#### Scenario: Restart loads the new code
- **WHEN** the developer chooses Restart control panel while it is outdated
- **THEN** the shared dialog remains only until a replacement panel identity is ready, the active document is replaced at the same route, and neither the dialog, chip nor dot remains

#### Scenario: Replacement reuses a process ID
- **WHEN** the replacement panel starts with the same operating-system process ID as the prior panel but a different startup identity
- **THEN** restart recovery recognizes the replacement and reloads the active interface automatically

#### Scenario: Restart does not recover
- **WHEN** no replacement panel identity answers within the bounded restart interval
- **THEN** the blocking progress state ends in a closable failure presentation that tells the developer how to retry

#### Scenario: Only the panel UI changed
- **WHEN** only a file under the panel's UI folder changed after the panel started
- **THEN** no restart is suggested; reloading the page shows the change

### Requirement: Tool maintenance navigation is explicit authorization
Choosing Restart or Rebuild from shared navigation SHALL be the explicit authorization for that action. Registered tools SHALL execute the selected maintenance action in place without navigating to Control Panel or presenting a second confirmation. Consumed legacy maintenance parameters SHALL execute once and SHALL NOT repeat on refresh. Restart SHALL replace the active document only after a different panel startup identity is ready.

#### Scenario: Rebuild from a registered tool
- **WHEN** the developer chooses Rebuild while a registered tool is active
- **THEN** the current tool route remains visible behind a shared progress dialog, rebuild starts without a confirmation dialog, and live status and bounded output remain visible until completion or failure

#### Scenario: Restart from a registered tool
- **WHEN** the developer chooses Restart while a registered tool is active
- **THEN** the current tool route remains visible behind the shared restart dialog, the dialog closes when the replacement panel is ready, and the same tool route reloads automatically

#### Scenario: Legacy maintenance URL opened
- **WHEN** a maintenance navigation URL is opened
- **THEN** the requested action executes once after its parameter is removed and refreshing does not repeat it
