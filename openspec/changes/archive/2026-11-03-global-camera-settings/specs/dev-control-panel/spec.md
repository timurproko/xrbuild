# Spec Delta

## ADDED Requirements

### Requirement: Global camera settings

The panel SHALL provide a global Settings page from its shared product menu. Its Camera section SHALL configure one
projection policy, Perspective or Orthographic, for every distribution choice shown by the project Platform control:
Desktop, WebXR and installed platform choices. Camera policy SHALL be stored once per workspace, independently of
project manifests. A distribution choice without a saved policy, including a newly installed choice, SHALL default
to Perspective. Saved policy for a disabled or temporarily unavailable choice SHALL be retained and remain readable.

#### Scenario: Open Settings

- **WHEN** the developer chooses Settings from the product menu
- **THEN** the panel opens the global Settings page and shows the Camera policy for each known distribution choice

#### Scenario: Configure the desktop channel

- **WHEN** the developer sets Desktop to Orthographic
- **THEN** the workspace stores that override without modifying any project manifest

#### Scenario: New distribution choice

- **WHEN** a platform choice appears for the first time and has no saved camera policy
- **THEN** Settings shows Perspective and apps built for that choice receive Perspective

#### Scenario: Choice temporarily unavailable

- **WHEN** a platform plugin with a saved Orthographic policy is disabled or unavailable
- **THEN** Settings retains the saved choice and policy instead of deleting or reassigning it

#### Scenario: Projection guidance

- **WHEN** the developer views an Orthographic policy
- **THEN** Settings explains that it controls mono browser and 2D host views while stereo and immersive eye rendering remains perspective

### Requirement: Plugin-contributed global settings

The panel SHALL use the global Settings page as the configuration surface for installed plugin runtime settings and
plugin-owned tool/app preferences. A plugin SHALL declare settings through a bounded metadata schema rendered with
panel-owned controls; plugins SHALL NOT inject arbitrary settings markup or scripts. Runtime-provider values and
plugin-owned panel/tool values SHALL be stored separately under the plugin identity, and only runtime-provider values
SHALL be applied to native provider configuration. Plugin Manager SHALL continue to own enablement, metadata and
samples but SHALL NOT render plugin settings.

The contribution schema SHALL support bounded text, number, boolean and select fields with labels, defaults, hints,
optional numeric limits and optional section grouping. Invalid schemas or values SHALL be rejected without making
other Settings cards unavailable. Installed disabled plugins SHALL retain their values and remain identifiable in
Settings, while editing remains unavailable until the plugin is enabled.

Settings SHALL provide a left-side contribution filter headed **Module**. **All** SHALL show core and plugin settings,
**Apps** SHALL show only core-owned settings, and each plugin that exposes settings SHALL have one filter item
that shows only that plugin's contribution. Plugins without settings SHALL not appear in the filter. The **Module**
heading and module column SHALL remain sticky, with the module list scrolling internally only when it exceeds the
available viewport height. Every displayed owner SHALL have a sticky, full-width outside-card heading using **Apps** or the plugin title; owner names and general plugin descriptions SHALL not be repeated inside Settings cards. A plugin MAY declare one bounded Settings-specific description for its contributed controls. At desktop
widths the content SHALL use the same bounded middle column as Plugin Manager and leave the remaining right column
empty. The app bar SHALL paint above sticky owner headings, and sticky owner headings SHALL occlude scrolled controls
instead of allowing segmented tabs or inputs to overlap either header. Within a plugin card, subsequent declared
sections SHALL use a shared design-system divider with equal token-based spacing on both sides, boolean fields SHALL
stack as full rows, and shared helper copy below controls SHALL use lower emphasis than field labels and values. Plugin
The core project surface SHALL be labelled **Apps** and Plugin Manager SHALL be labelled **Plugins** in navigation and page chrome. Plugins SHALL show a Settings shortcut beside the
folder action only when the selected plugin contributes settings. Plugin metadata MAY declare one bounded `glyph`
character when no PNG icon is available. PNG icons SHALL take precedence; declared glyphs and the fallback puzzle
SHALL automatically use the shared light/dark theme tint, including matching favicons.

#### Scenario: Filter all settings

- **WHEN** the developer selects All in the Settings sidebar
- **THEN** the content column shows Apps cards followed by every installed plugin contribution

#### Scenario: Filter one settings owner

- **WHEN** the developer selects Apps or a contributing plugin in the Settings sidebar
- **THEN** the content column shows only cards owned by that selection

#### Scenario: Plugin without settings

- **WHEN** an installed plugin declares no runtime or panel/tool settings
- **THEN** it does not appear in the Settings sidebar

#### Scenario: Runtime settings appear globally

- **WHEN** an installed plugin declares native runtime settings
- **THEN** Settings shows those controls in that plugin's card and Plugin Manager does not duplicate them

#### Scenario: Plugin tool preferences appear globally

- **WHEN** a plugin declares panel/tool preference fields
- **THEN** Settings shows generic design-system controls for them without executing plugin-provided UI

#### Scenario: Runtime and tool values remain separate

- **WHEN** the developer saves both runtime-provider fields and plugin-owned tool fields
- **THEN** the panel stores both under the plugin identity but adds only runtime-provider values to app provider configuration

#### Scenario: Managed tool reads effective preferences

- **WHEN** a plugin-owned managed tool starts or reloads
- **THEN** it can read its validated effective runtime and panel/tool values from a same-origin panel API

#### Scenario: Disabled plugin contribution

- **WHEN** an installed plugin with saved settings is disabled
- **THEN** Settings preserves and identifies its contribution without allowing edits until it is enabled

#### Scenario: Module headings remain outside cards

- **WHEN** Settings shows Apps and plugin contributions
- **THEN** the left filter is headed **Module**, and each displayed owner is titled above its card without duplicating the owner name inside the card

#### Scenario: Settings controls scroll under the heading

- **WHEN** a long Settings page scrolls a segmented control or input beneath a sticky module heading
- **THEN** the heading's opaque layer hides the control, and the app bar hides the heading at the top boundary, instead of allowing layers to overlap

#### Scenario: Module navigation stays available

- **WHEN** Settings content is taller than the viewport but the module list fits
- **THEN** the module column stays in place without scrolling its list

#### Scenario: Plugin Manager links to contributed settings

- **WHEN** the selected plugin contributes runtime or panel settings
- **THEN** Plugin Manager shows a Settings icon beside its folder icon that opens that plugin's Settings filter

#### Scenario: Plugin declares a glyph

- **WHEN** an installed plugin without a PNG icon declares one valid glyph character
- **THEN** Plugins and Settings show that glyph using the current theme tint, and a PNG still takes precedence when both are present

#### Scenario: Contributed sections remain distinct

- **WHEN** a plugin card contains multiple declared sections
- **THEN** each section after the first begins below a full-width divider

#### Scenario: Boolean settings scan vertically

- **WHEN** a contribution contains multiple boolean fields
- **THEN** each checkbox occupies its own full row rather than sharing a two-column row

#### Scenario: Field help has lower emphasis

- **WHEN** a field includes descriptive help below its control
- **THEN** the shared component renders that copy smaller and lower-contrast than the field label and current value

#### Scenario: Invalid contribution

- **WHEN** plugin metadata declares unsupported controls, duplicate keys, invalid limits or excessive settings
- **THEN** the panel reports invalid plugin metadata and continues rendering other global settings

#### Scenario: Diagnostic tool uses global settings

- **WHEN** the hand-tracking diagnostic tool is opened from the panel
- **THEN** processor, threshold and recording preferences come from its plugin's global settings and no separate Settings tab is shown in the tool

### Requirement: Camera-aware app build context

Before running an app's build or dev script, the panel SHALL resolve the project's effective distribution choice and
workspace camera policy and provide that bounded context to the app toolchain. Successful build receipts SHALL record
the resolved context. A build whose recorded camera policy differs from current global Settings SHALL be stale and
SHALL be rebuilt by the existing automatic Run, package or publication flow before its output is consumed. Direct app
builds without panel context SHALL default to Perspective.

#### Scenario: Desktop browser build

- **WHEN** a project on Desktop is built while Desktop is configured Orthographic
- **THEN** its app toolchain receives the Orthographic policy and the successful receipt records it

#### Scenario: Immersive distribution build

- **WHEN** a project on WebXR or an installed immersive platform is built with its default policy
- **THEN** its app toolchain receives Perspective

#### Scenario: Global policy changed after build

- **WHEN** an app was built with Perspective and the developer changes its current distribution choice to Orthographic
- **THEN** the next Run, package or publication action rebuilds the app before using its output

#### Scenario: Project manifest unaffected

- **WHEN** the developer changes any global camera policy
- **THEN** no project's `xrb-project.json` is rewritten

#### Scenario: Direct terminal build

- **WHEN** a template-based app is built outside the panel without camera-policy environment values
- **THEN** it builds with Perspective rather than failing or selecting Orthographic implicitly
