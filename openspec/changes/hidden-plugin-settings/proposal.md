# Proposal

## Why

Plugins need to remove expert fields from Settings without removing their declarations or changing effective runtime configuration. Hiding controls alone would break form saves and discard previously saved values, so presentation metadata must be paired with safe preference preservation.

## What Changes

- Add optional boolean `hidden` metadata to runtime `settings` and `panel.settings` fields; absent or false retains existing behavior. Reject invalid flag types and do not extend the separate `config` schema.
- Filter hidden fields consistently before rendering controls, section headings, dividers and forms, and before reading form values for autosave.
- Preserve omitted, declared hidden values from the currently owned preference record inside the existing preference lock, without materializing missing defaults. Explicit validated API values still take precedence; visible-field replacement semantics remain unchanged.
- Keep defaults, saved values, project overrides and host command-line overrides independent of presentation metadata.
- Add neutral schema, preference API, runtime-precedence and browser regressions, plus one short documentation paragraph describing the flag.

## Capabilities

### New Capabilities

- `plugin-settings`: Plugin preference field presentation, effective values and origin-aware saving.

### Modified Capabilities

None. The current specification inventory contains only `app-launch-return`; there is no existing `control-panel/spec.md`. This change therefore introduces the focused `plugin-settings` capability rather than extending a nonexistent broad control-panel specification.

## Impact

- `packages/control-panel/src/plugin-manager.ts`: bounded field allowlist, validation and normalized `PluginSetting` metadata; effective-settings behavior remains unchanged.
- `packages/control-panel/ui/app.js`: shared visible-field selection for settings forms, section boundaries and autosave in both preference scopes.
- `packages/control-panel/src/panel.ts`: narrow preservation merge in the existing locked preference update, using `pluginPreferenceValues()` for qualified and eligible legacy ownership.
- Tests alongside `plugin-manager.test.ts`, `plugin-sources.test.ts`, `ui-plugin-config.test.ts` and focused settings browser coverage; host configuration precedence coverage where applicable.
- `docs/embedded-extensions.md`: one short paragraph for the new field-level flag.
- No new dependencies, preference files, automatic migrations, concrete integration declarations or native provider changes. All fixtures are synthetic; no live panel, saved user settings or hardware runtime is used.
