# Tasks

## 1. Native rebuild skips hand-mesh programs

- [x] 1.1 Leave plugins that declare a hand mesh out of the native plugin plan used by Rebuild and freshness; cover it in the native origins tests.

## 2. Prerequisite state on the layer card

- [x] 2.1 Show Prerequisite from the first render while setup is missing, with only Install and the requiring setting active and Retry hidden; cover it in a browser test.
- [x] 2.2 Keep long setup dialog messages inside the dialog width.

## 3. Stale runtimes and re-check without download

- [x] 3.1 Report a runtime prepared for another plugin source as needing setup during discovery, with a plain reason.
- [x] 3.2 Re-bind an installed runtime through the setup's `refresh` when Install runs, without downloading; cover both in setup tests.

## 4. Local setup files

- [x] 4.1 Accept a plan's `input`, show a design-system file picker, copy the chosen file privately and pass it to `install({ from })`, deleting it afterwards; cover it in setup and browser tests.

## 5. Core-provisioned plugin Python

- [x] 5.1 Validate a manifest `python` declaration with exact versions, hash-locked wheels and named sets.
- [x] 5.2 Provision reusable environments and runtime-folder placements with a pinned uv, listed in the same consent plan; cover both with tests that run no network.

## 6. Plugin switches lock until confirmed

- [x] 6.1 Add one shared pending-switch behaviour and use it for the post-processing layer switch and the plugin enable switch; cover the layer switch, stale repaints and failure in a browser test.

## 7. Start explains why it cannot run

- [x] 7.1 Keep Start clickable when only the provider choice blocks it, and show the reason with Open Setup as a toast on click; align the toast close button with its title; cover both in a browser test.

## 8. Steady mesh when a processor skips frames

- [x] 8.1 Hold each hand's latest valid surface in the SDK mesh client, compensated every render until its source age expires, keep topology per hand, and clear on failures; cover it in an SDK test.

## 9. App Settings tab

- [x] 9.1 Rename the library parameters tab to Settings, place it last and use a plain card title per library; let UI Kit consume its own theme parameter so its Settings tab chooses the theme it runs with; cover both in panel and embedded tests.

## 10. Accent theme replaces Chamfer

- [x] 10.1 Replace the Chamfer style with Accent: solid accent bodies with filleted edges and a satin finish, an optional on-body ink for text and icons, a pale slider bar with a half-accent fill and a ribbed grip; resolve a saved Chamfer choice to Accent; cover it in UI Kit, panel and embedded tests.
