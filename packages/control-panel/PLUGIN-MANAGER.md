# Workspace plugins

The standalone **Plugins Manager** tool lists every managed folder under `<workspace>/plugins/`, including packager-only plugins. Internal implementation folders may declare `"hidden": true` in `xrb-plugin.json`; they remain available to their parent plugin but do not become separate manager rows. Enable/disable is workspace-wide and saved in `<workspace>/xrb-plugins.json`. Disabling keeps the files, build outputs and project selections. Runs and packages use available inputs, the primary desktop display and standalone mode while a selected provider is disabled; enabling restores the saved selections. Disabled plugins disappear from project choices. Plugin configuration is edited in the global **Settings** page, whose sidebar filters All, Control Panel and each plugin that contributes settings. Stop a running app and jobs before changing native runtime preferences.

Projects choose inputs independently in Settings. The manifest stores `"inputs": ["mouse", "keyboard", "tracker"]`; `mouse` and `keyboard` control browser events, while every other selected name starts a host input provider concurrently. New projects start with Mouse only. Existing manifests with a single `"input"` remain supported (with Mouse and Keyboard as before) and migrate when Settings are saved. Package builds include every enabled selected plugin; disabled ones are skipped.

Every new plugin must supply `<workspace>/plugins/<folder>/xrb-plugin.json`. `title` is the exact user-facing Title Case name and `type` is the stable lowercase subtitle in Plugins Manager. Supported types are `display`, `input`, `platform`, `publisher`, and `plugin`. The folder/provider ID remains the compatibility identity and is not used as display copy.

```json
{
  "title": "Tracker",
  "type": "input",
  "description": "Hand tracking from depth cameras",
  "icon": "icon.png",
  "panel": {
    "samples": [
      { "id": "diagnostic", "path": "samples/diagnostic", "description": "Editable diagnostic project." }
    ],
    "hiddenProviders": ["fixture-input"],
    "settings": [
      { "key": "processor", "section": "Diagnostic", "label": "Processor", "type": "select", "default": "cpu", "options": [{ "value": "cpu", "label": "CPU" }, { "value": "gpu", "label": "GPU" }] },
      { "key": "recordingLimit", "section": "Recording", "label": "Maximum duration", "type": "number", "default": 120, "min": 1, "max": 120, "step": 1 }
    ]
  },
  "settings": [
    { "key": "debugImages", "section": "Provider", "label": "Camera debug images", "type": "boolean", "default": false },
    { "key": "configPath", "section": "Provider", "label": "Pipeline config path", "type": "text", "default": "" },
    { "key": "threshold", "section": "Provider", "label": "Threshold", "type": "number", "default": 0.5, "min": 0, "max": 1, "step": 0.05, "hint": "Example numeric option" }
  ]
}
```

A panel sample path is relative to the plugin and must contain a valid `xrb-project.json`. Plugins Manager reads the original in place and offers **Import**, which copies an independent project into `projects/plugins/<name>` and therefore the `PLUGINS` project-list section. The imported copy can be edited, archived or deleted without changing the plugin original; generated output and dependency folders are not copied. `panel.hiddenProviders` keeps diagnostic or unfinished native providers out of normal project choices without disabling the plugin's tools, samples or settings. An existing explicit project selection remains readable as unavailable until the user replaces it.

Packager identity fields may declare `hidden: true` and `deriveStyle: "filename"` or `"package"` with an optional `prefix` to generate a fixed ID from the title before the first build. Keep validation in the packager.

The optional `icon` must be a PNG inside the plugin folder and takes precedence. Without one, a plugin may declare one bounded `glyph` character; the panel recolors that glyph with the current light/dark theme and uses it in Plugins and Settings. Without either, the manager shows the same themed puzzle-piece placeholder. Legacy plugin folders with no manifest retain bounded compatibility fallbacks. Once `xrb-plugin.json` exists, both `title` and `type` are required so the UI never needs product-specific naming rules. A display plugin may also declare `"screenName": "Stereo Panel"` (the physical monitor name returned by the OS) and `"displayMode": "3D"`. The panel then offers both desktop 2D and plugin 3D choices for that screen.

Top-level `settings` are native runtime/provider values. `panel.settings` are plugin-owned tool or app preferences and are never added to host provider configuration. Both use panel-rendered `text`, `number`, `boolean`, or `select` fields; `number` may declare `min`, `max`, and `step`, `select` requires bounded `{ value, label }` options, and `section` groups related controls in the plugin's global Settings card. An optional bounded `panel.settingsDescription` explains that contribution above its controls without repeating the plugin's general Plugin Manager description. Keys must be unique across both lists. The panel validates and stores the values under the plugin ID; plugins cannot inject settings markup or scripts. Native provider values are merged into the host's `plugins.<provider-name>` configuration for runs, with a project's own plugin settings taking precedence.

A managed plugin tool reads its effective values from `GET /api/plugins/manage/<plugin-id>/settings`, which returns `{ enabled, runtime, panel }`. Tool preferences may be saved while the tool is open; native runtime values still require running apps and jobs to stop and normally take effect on the next provider start. A tool should use validated local defaults when run directly without the panel. Do not use settings fields for secrets: preferences are stored as plain JSON.

A publisher suite uses type `publisher` and may expose several destinations from one plugin. Declare them structurally in `package.json`; an optional `setting` binds each destination to a boolean setting in `xrb-plugin.json`. Publisher IDs remain stable even when their implementations live in hidden component folders.

```json
{
  "xrBuild": {
    "publishers": [
      { "module": "../publisher-local-test/publisher.mjs", "setting": "localhost" },
      { "module": "../publisher-production-web/publisher.mjs", "setting": "production" }
    ]
  }
}
```
