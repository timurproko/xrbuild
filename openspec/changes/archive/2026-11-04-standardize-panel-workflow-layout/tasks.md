## 1. Shared layout and project workflow

- [x] 1.1 Add tokenized shared workspace inset, gap and sidebar layout primitives; update Control Panel, Plugins, Settings and the tracking diagnostic to consume them while retaining their responsive topology; verify focused design-system UI tests cover the shared geometry and pass.
- [x] 1.2 Make Develop and Build full-width underlined card tabs matching Log and Jobs; keep the icon/title and JSON/folder actions together on the identity row, then align the Run/Build action and published URL beneath; suppress native browser context menus while preserving panel-owned context menus; give non-tab card headings the same top rhythm as tab rows; verify focused panel UI tests cover the card-local workflow, activity markup and global context-menu suppression.

## 2. Package version actions

- [x] 2.1 Add a shared bounded Patch/Minor/Major context menu for valid pending package versions that changes only the unsaved input; verify unit/UI tests cover each increment and invalid versions.

## 3. Windowed preview geometry

- [x] 3.1 Use one constrained centered 1280 x 720 outer-window target for non-fullscreen host and browser previews while preserving fullscreen behavior; verify focused panel browser-launch and host tests pass.

## 4. Verification

- [x] 4.1 Run focused control-panel tests, relevant tracking diagnostic checks, `pnpm check:names`, and strict OpenSpec validation; verify all pass. Manual desktop and narrow viewport inspection remains a maintainer acceptance check.
