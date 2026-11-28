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

## 7. Blocked Start explains itself

- [x] 7.1 Show a lasting corner notice with the reason and Open Setup while Start is unavailable, and the same reason on the button; cover it in a browser test.
