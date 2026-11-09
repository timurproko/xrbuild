## Why

The workspace split routes embedded projects into a separate read-only detail screen and blocks their normal project actions. Users lose the original Develop / Publish / Build interface, cannot package or publish the supplied apps, and cannot organize them with their other projects. Source ownership should not impose these user-facing restrictions.

## What Changes

- Give embedded projects the same compact project card, workflow tabs, settings, context menus and capability-based actions as ordinary projects. Do not require Copy to workspace for normal use.
- Support development, native/browser runs, web builds, packaging, publication/release management, icon actions and rename/settings changes using persistent user-owned working state and contained build outputs.
- Allow embedded and ordinary projects to share user-created sections, ordering, archive/unarchive behavior and counts. Store embedded organization as user metadata instead of moving product folders.
- Make deletion the only embedded-origin-specific restriction, enforced by the server and reflected in the menu. Existing kind/target/provider/tool/signing requirements still apply equally to both origins.
- Keep bundled source/defaults immutable and user state durable across restart, rebuild and safe product updates; preserve qualified identities, existing personal choices and unrelated user/private work.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `bundled-extensions`: replace copy-required operational restrictions with normal project workflows backed by user-owned state and non-deletable product identity.
- `dev-control-panel`: unify embedded project workflow presentation, organization and lifecycle actions with ordinary projects.

## Impact

- Core-owned control-panel discovery, access checks, effective project state, development/build/icon preparation, packaging/publication adapters and layout/lifecycle routes.
- Browser project rendering, drag/drop, menus and workflow settings; shared design-system components remain authoritative.
- Focused API, state, build and browser tests plus documentation/instruction updates during implementation.
- Core-only delivery; no private clone, private edits or source promotion. Existing plugin contracts remain neutral.
- This plan follows the active bundled-extensions predecessor; bot synchronization remains ordered and is not performed by this task.
