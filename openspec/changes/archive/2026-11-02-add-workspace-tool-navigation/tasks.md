## Implementation

- [x] Add validated optional workspace tool links and read-only navigation discovery; verify missing/invalid/oversized/remote/credential URLs and workspace isolation in focused tests.
- [x] Separate stable navigation entries from maintenance and share tool navigation behavior; give Plugins Manager its own `/plugins/` route; verify exact ordering, active-page state, keyboard handling, safe return URLs and confirmation before maintenance.
- [x] Register the private tool and eliminate unstyled/reinitialization flashes without automatic capture; use shared design-system chrome, typography, cards, tabs, states, menus and dropdowns; add stable tool titles/favicons and app-derived native window titles; verify render-blocking CSS, delayed modules, failure fallback and zero camera/model starts.
- [x] Run focused and full panel/tool tests, strict live check/build and name guard; verify existing behavior without modifying the primary checkout.
