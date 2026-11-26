# Tasks

## 1. Hidden field metadata retains effective configuration

- [ ] 1.1 Extend `PluginSetting`, the bounded property allowlist and field parser with boolean hidden metadata for runtime and panel preference fields only; add schema regressions for true, false, absence, invalid types and config rejection alongside `plugin-manager.test.ts`.
- [ ] 1.2 Keep `effectiveSettings()` and value validation semantics unchanged; add neutral comparison cases proving defaults and saved boolean, text, number and select values behave identically with and without hidden flags, including explicit false and empty strings.
- [ ] 1.3 Add launch-preparation regression coverage using mock providers and generated config inspection to show saved hidden values remain effective and project overrides win, without starting the host or any device runtime.
- [ ] 1.4 Extend the existing native configuration-merge test with neutral false and empty-string command-line override cases; keep production native code unchanged and report native execution separately if the native test binary cannot be rebuilt/run.
- [ ] 1.5 Add one short paragraph to `docs/embedded-extensions.md` documenting both preference scopes, presentation-only behavior, hidden-value preservation, explicit API validation and unchanged override precedence; check the paragraph against the schema and spec.

## 2. Settings omits hidden controls and autosave values

- [ ] 2.1 Introduce one visible-field predicate/helper in `ui/app.js`, apply it before form/section generation and card divider decisions, and add UI regressions for mixed and hidden-only sections/scopes with no empty forms or orphan dividers.
- [ ] 2.2 Use the same predicate in `savePluginSettings()` before accessing form controls; add saver tests for both scopes proving absent hidden inputs are never read and hidden defaults/cached values are never submitted.
- [ ] 2.3 Add a focused fixture browser test for absent hidden headings/controls, unchanged visible labels/hints/order and successful visible autosave with payload inspection; cover hidden false and no-flag plugins and update extracted-function test harnesses for the helper.

## 3. Locked preference writes preserve owned hidden values

- [ ] 3.1 Merge only present declared hidden entries from `pluginPreferenceValues()` inside the existing `updatePluginPrefs()` callback, followed by explicitly submitted validated entries, for both scopes; add API regressions for false, empty strings, custom text, absent defaults and repeated visible saves.
- [ ] 3.2 Add API regressions for qualified-record priority, eligible legacy seeding of a qualified save, unqualified compatibility routes, selected duplicate-origin isolation and unresolved-origin refusal; assert unrelated records, scopes and preference data remain unchanged.
- [ ] 3.3 Add explicit valid/invalid hidden-write regressions, byte-preserving rejection cases and lock refusal; assert omitted visible fields still use replacement semantics and plugins without hidden metadata behave exactly as before.
- [ ] 3.4 Extend the focused browser fixture with an intervening hidden-value writer after page load, a visible save without hidden snapshot submission, reload and another save; assert current owned hidden values survive on disk and in effective settings in both scopes, and browsing alone writes no preference file.
- [ ] 3.5 Run quick targeted schema/API/UI checks and the focused browser coverage, recording browser/native execution distinctly from source/unit results and ensuring all disposable fixtures, browser instances and servers are closed; use no running personal panel, live settings, camera or tracking runtime.
