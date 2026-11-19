## MODIFIED Requirements

### Requirement: Return to a launcher
An app whose page URL carries `xrb-launch=1` and an `xrb-return` value that resolves, relative to the page, to an HTTP(S) URL SHALL show the SDK's own return control; any other page SHALL show none. `createXrb()` SHALL create that control at most once per page, from code bundled with the SDK and attached to the app's existing scene and interaction runtime, and SHALL NOT load any script from the launcher. It SHALL NOT create the control in the app icon view. `loadReturnOverlay(interaction, href?)` SHALL expose the same loading step and `returnTargetFromLaunch(href?)` SHALL return the resolved return URL or null. The control SHALL be a round close button near the top-right corner of the physical panel that hand and mouse can press. Releasing a press SHALL navigate once to the return URL with `xrb-launch` and `xrb-return` removed, `xrb-resume=1` set and `xrb-camera` set to the app's current projection. `appLaunchUrl(launchHref, context)` SHALL build a launch URL carrying `xrb-launch=1`, the absolute return URL and, when given, the projection.

#### Scenario: Opened from a launcher
- **WHEN** a launcher at `/preview/launcher/` opens globe with `xrb-launch=1` and `xrb-return=/preview/launcher/`
- **THEN** globe shows the SDK's close control without requesting a script from `/preview/launcher/`, and pressing it navigates to `/preview/launcher/` with `xrb-resume=1` and the current `xrb-camera`

#### Scenario: Opened directly
- **WHEN** an app is opened without `xrb-launch=1` or without `xrb-return`
- **THEN** it shows no close control

#### Scenario: Unsupported return scheme
- **WHEN** `xrb-return` resolves to a URL that is not HTTP(S)
- **THEN** the app shows no close control and does not navigate there

#### Scenario: Another site
- **WHEN** an app is opened with `xrb-launch=1` and an HTTP(S) `xrb-return` on another origin
- **THEN** it loads no script from that origin, shows the SDK's close control, and pressing it navigates to that URL

#### Scenario: Repeated press
- **WHEN** the close control is pressed again while its navigation is pending
- **THEN** only one navigation to the return URL occurs

## ADDED Requirements

### Requirement: Mouse cursor style
The SDK SHALL support the cursor styles `system`, `ring` and `ring-dot`, exported with `system` as the default. `createXrb()` SHALL take the style from the `xrb-cursor` launch parameter when present, otherwise from its `cursor` option; an absent or unrecognized value SHALL resolve to `system`. Mouse input SHALL be enabled unless the `mouse` option is false, the host reports mouse disabled, or the launch carries `xrb-mouse=0`; the cursor style SHALL NOT enable it. With mouse enabled and style `system`, the canvas SHALL keep the browser pointer and the SDK's cursor object SHALL stay hidden. With `ring` or `ring-dot`, the canvas SHALL hide the browser pointer and the cursor object, when the app has added it to its scene, SHALL draw a ring where the mouse ray lands, hidden after 3 seconds without pointer movement unless the button is held; `ring-dot` SHALL add a centre dot only over an enabled interaction target. With mouse disabled, the canvas SHALL hide the browser pointer and the cursor object SHALL stay hidden. When a host is present the SDK SHALL report the style to it, reporting `ring-dot` when mouse is disabled. Disposal SHALL restore the canvas cursor style it replaced. `appLaunchUrl` SHALL copy a valid `xrb-cursor` and `xrb-mouse` from the return URL to the launched app's URL.

#### Scenario: Default
- **WHEN** an app starts with mouse enabled and no `xrb-cursor` parameter or `cursor` option
- **THEN** the style is `system`, the browser pointer is visible over the canvas and no ring is drawn

#### Scenario: Launch parameter wins
- **WHEN** an app created with the `cursor` option `ring` is opened with `xrb-cursor=ring-dot`
- **THEN** the style is `ring-dot`

#### Scenario: Unrecognized value
- **WHEN** an app is opened with `xrb-cursor=old-style`
- **THEN** the style is `system`

#### Scenario: Hover dot
- **WHEN** the style is `ring-dot` and the mouse moves from empty space onto an enabled interaction target and then onto a disabled one
- **THEN** the ring shows a centre dot over the enabled target only

#### Scenario: Ring without a dot
- **WHEN** the style is `ring` and the mouse is over an enabled interaction target
- **THEN** the ring is drawn without a centre dot

#### Scenario: Mouse disabled
- **WHEN** an app is opened with `xrb-mouse=0` and `xrb-cursor=system`
- **THEN** mouse interaction stays unbound, no ring is drawn and the canvas hides the browser pointer

#### Scenario: Launcher opens an app
- **WHEN** a launcher whose own URL carries `xrb-cursor=ring` and `xrb-mouse=1` builds an app URL with `appLaunchUrl`
- **THEN** the app URL carries `xrb-cursor=ring` and `xrb-mouse=1`
