# Design

## Context

See `proposal.md` for motivation. `PluginSetting` and the bounded `SETTING_KEYS` validator in `packages/control-panel/src/plugin-manager.ts` currently have no field-level hidden metadata. The separate plugin-level hidden flag is unrelated. The same field parser handles runtime settings, panel settings and user-owned config, so scope checks are necessary.

`pluginSettingsForm()` currently iterates every field, while `savePluginSettings()` expects a matching input for every declared field. `pluginSettingsCard()` bases the panel form divider on the unfiltered runtime array. The preference PUT endpoint in `packages/control-panel/src/panel.ts` validates supplied objects inside `updatePluginPrefs()` but replaces each target plugin object completely. `pluginPreferenceValues()` already chooses qualified records before eligible legacy records, without cross-origin fallback.

`effectiveSettings()` merges defaults and valid stored values independently of presentation. `runtimeConfig()` overlays project values before `hostArgs()` writes launch configuration. The native `hostcfg::pluginConfig()` then overlays command-line options; existing native tests exercise this final merge without starting providers.

The current OpenSpec inventory has no control-panel capability. The sole plan correction is to introduce a focused `plugin-settings` specification rather than modify a nonexistent `control-panel/spec.md`.

## Goals / Non-Goals

**Goals:**
- Share one visibility predicate across runtime and panel rendering, divider decisions and save collection.
- Preserve only omitted declared hidden entries, from the latest correctly owned saved record, within the existing preference transaction.
- Exercise the full contract with neutral fixtures and no user configuration or physical devices.

**Non-Goals:**
- Do not change `config`, `advanced`, `shownWhen`, plugin-level hiding, preference key selection, origin resolution or storage formats.
- Do not change native providers, calibration, tracking, runtime setup or any concrete plugin declaration.
- Do not turn visible preference writes into general patch semantics or bypass explicitly submitted hidden values.

## Decisions

### 1. Add opt-in field presentation metadata, not a second schema

Extend `PluginSetting` and `SETTING_KEYS` with boolean `hidden`; accept it only when the source is not `config`. Normalize true into metadata; missing or false behaves as visible. Keep all type, default, option and range checks intact and leave `effectiveSettings()` unchanged.

Deleting declarations would lose default/runtime behavior; CSS hiding would retain missing-input assumptions and stale submissions. Reusing `advanced` or `shownWhen` would conflate independent config-only behaviors. Reject those alternatives.

### 2. Filter before layout and before reading form controls

Use one helper/predicate selecting fields whose hidden flag is not true. Apply it in form rendering, card scope/divider decisions and save collection. Filter before headings and empty-form checks, not while producing individual controls. The initial visible panel form must not be divided merely because hidden runtime fields exist. Keep visible field labels, hints, ordering, disabled state and autosave behavior unchanged.

Do not synthesize hidden form inputs or copy hidden values from `plugin.values` into requests. Such snapshots would overwrite a later writer's saved values. This presentation flag does not alter the separate user-owned config UI.

### 3. Preserve hidden entries at the existing locked write boundary

For each submitted preference scope, inside the existing `updatePluginPrefs()` callback:

1. Resolve the current owned saved values with `pluginPreferenceValues(plugin, prefs, scope)`, not a page snapshot or an unlocked read.
2. Select only own entries whose current declared fields have hidden true. Use property presence, never truthiness, so false and empty strings survive. Keep stored values as stored; do not call `effectiveSettings()` to seed persistence.
3. Validate the submitted object normally, including any explicitly supplied hidden entries.
4. Assign preserved hidden entries followed by validated submitted entries to the existing `preferenceKey`.

This preserves replacement semantics for visible fields and plugins without hidden metadata. Qualified records remain authoritative as a whole; do not supplement them field-by-field from a legacy record. An eligible legacy record can seed a new qualified record only through the existing resolver. Leave other records, scopes, origins, disabled lists and unknown top-level preferences untouched. Existing locks, atomic replacement, conflict checks and service refresh guards remain authoritative.

Explicit valid API writes to hidden fields remain supported and win last. A stale form that omits hidden fields cannot erase or revert them; the new browser saver never sends stale hidden snapshots. There is no new promise to detect the age of an explicitly submitted hidden value: the existing API has no per-field revision protocol, and adding one is out of scope.

### 4. Cover each boundary with synthetic regressions

- Schema/unit tests beside `plugin-manager.test.ts`: both scopes, true/false/absent, invalid flag types, config rejection, unchanged bounds/default validation and effective-settings equality before/after hiding, including false and empty strings.
- API tests beside `plugin-sources.test.ts` and `extension-catalog.test.ts`: absent defaults stay absent, repeated visible saves preserve hidden values, an intervening writer's latest hidden values survive stale omission, explicit hidden writes override, invalid writes preserve bytes, qualified priority, eligible legacy seeding, duplicate-origin isolation and unrelated preference preservation. Include no-flag visible replacement compatibility and lock refusal.
- Launch preparation tests alongside plugin-manager coverage: mock provider discovery and inspect generated config without launching a host; saved hidden values remain effective and project overrides win. Extend `native/host/tests/host_tests.cpp` with generic boolean false and empty-text command-line precedence cases, without any native provider changes. Report native execution separately if unavailable.
- UI unit coverage alongside `ui-plugin-config.test.ts` plus a focused browser test: mixed/hidden-only groups, no empty preference forms or orphan dividers, both scope payloads, absent hidden inputs, visible autosave, reload and a stale-page/intervening-writer round trip. The browser test must use an independent fixture workspace and free loopback port with teardown.
- Add exactly one short paragraph to `docs/embedded-extensions.md` covering field scope, presentation-only semantics, preserved values/defaults, explicit API validation and unchanged override precedence.

Use quick checks for each outcome rather than broad local suites. Browser checks are distinct from source/unit checks, and skipped browser/native checks are not successful execution. Disposable scratch output belongs under the task report directory; durable test code belongs in the checkout. Stop fixture servers and browser instances in teardown.

## Risks / Trade-offs

- [A stale browser overwrites hidden state] → Omit hidden values entirely in browser payloads and obtain preserved entries from the current locked record; explicit API values deliberately remain authoritative.
- [Origin leakage during preservation] → Reuse `pluginPreferenceValues()` and existing preference-key logic; cover qualified priority, eligible legacy fallback and duplicate-origin refusal.
- [Invisible defaults become saved preferences] → Copy only present own stored entries, never effective/defaulted values.
- [An old invalid hidden value remains on disk] → Retain it as stored rather than silently repairing it; unchanged effective-settings validation determines whether it applies. Explicit invalid submissions still fail atomically.
- [Filtering changes divider behavior or breaks extracted UI tests] → Update dependent UI test harnesses for the shared predicate and cover hidden-only scopes as well as mixed sections in browser checks.

## Migration Plan

No preference migration or automatic write is needed. Deploy the neutral core support before any downstream manifest opts into hidden metadata. Existing manifests are unchanged. To roll back, remove field flags from downstream manifests before using a core version that rejects them; saved values require no reset or conversion.
