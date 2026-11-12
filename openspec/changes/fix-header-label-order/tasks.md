## 1. Shared header/menu maintenance ordering

- [x] 1.1 Reuse the shared maintenance menu order for header labels while preserving logical DOM order, stable IDs and existing handlers; verify unit fixtures put Restart before Rebuild without changing navigation tool order or menu separators.
- [x] 1.2 Apply the ordering to panel and approved embedded hand-view headers, including default markup and any shared runtime ordering path; verify source/public fixtures bind the corresponding badges to the same menu order and headers without labels remain unchanged.

## 2. State and refresh safeguards

- [ ] 2.1 Preserve badge state/text/colour/visibility and menu-dot/action behavior across asynchronous status updates and navigation; verify browser fixtures cover both-visible, restart-only, rebuild-only and no-visible states without action invocation, empty slots or reversed labels.
- [ ] 2.2 Add focused cross-view/header regression coverage and perform changed-code checks; verify applicable panel/hand fixtures, strict public TypeScript, name guard and strict OpenSpec change validation pass without native/device setup or private workspace changes.
