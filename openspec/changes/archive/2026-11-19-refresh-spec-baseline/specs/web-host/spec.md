## ADDED Requirements

### Requirement: System cursor follows the page's cursor style
The host SHALL hide the operating-system cursor over its window unless mouse input is selected and the current page has set the cursor style `system`. Each main-frame load SHALL reset the style to `ring-dot`, so the system cursor stays hidden until the loaded page sets a style. The host SHALL expose `setCursorStyle(style)` to the page and SHALL apply only the values `system`, `ring` and `ring-dot`, only from the main frame of its own browser, and only when the call carries the URL and nonce that page registered for shell actions. A view switch between 2D and 3D SHALL keep the current choice.

#### Scenario: Page selects the system cursor
- **WHEN** mouse input is selected and the current page sets the cursor style `system`
- **THEN** the operating-system cursor is visible over the host window

#### Scenario: Page selects a ring style
- **WHEN** the current page sets the cursor style `ring` or `ring-dot`
- **THEN** the operating-system cursor is hidden over the host window

#### Scenario: Mouse input not selected
- **WHEN** the app runs without mouse input and its page sets the cursor style `system`
- **THEN** the operating-system cursor stays hidden over the host window

#### Scenario: New page
- **WHEN** the host loads another page in the main frame
- **THEN** the system cursor is hidden until that page sets the style `system`

#### Scenario: Unrecognized style or stale page
- **WHEN** a call carries an unrecognized style, or the URL and nonce of a page that is no longer current
- **THEN** the host ignores it
