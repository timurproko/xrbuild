## Implementation

- [x] Remove forced workspace setup and automatic first-project prompts while retaining normal empty/catalog views and direct routes; verify browser startup/reload and route tests for missing and empty roots pass without creating workspace files.
- [x] Initialize only missing combined/project-only scaffold on confirmed template creation, with no additional starter app; verify successful creation, cancellation, validation/collision safety, existing-file preservation and split-root tests pass.
- [x] Preserve lazy embedded writable actions and writable-path safeguards; verify embedded settings work without setup and linked/product roots remain refused without overwriting user or product data.
- [x] Keep service discovery/config defaults read-only for missing user roots while retaining explicit initialization and ownership checks; verify configured-service startup coverage, malformed/link refusal, affected public-module tests in the frozen embedded lane and actual public-product browser smoke all pass without initializing a missing selected root.
- [x] Update startup documentation and focused regressions; verify focused real-browser/API/helper suites, strict TypeScript, name guard and repository-pinned strict OpenSpec validation pass with results recorded, leaving synchronization/archive to the bot.

## Verification

- Onboarding API/real-browser and configuration/catalog suites: 44 passed, no skips. Includes configured service discovery and full startup, all four root states, direct routes, Cancel/Escape, explicit project creation, split-root/file preservation, embedded settings and unsafe destinations.
- Affected public factory ownership suites in a frozen writable embedded snapshot: 30 passed, no skips. Plugin-source and installed-service suites with real browser enabled: 15 passed, no skips.
- Embedded workflow suite: 12 passed; design-system/workspace helpers: 27 passed; focused server routing/creation: 3 passed; environment and package-graph policy: 12 passed. Workflow UI browser suite also passed.
- Actual public-product launch plus real-browser navigation showed embedded projects, one publisher and two packagers without creating the missing selected user root or opening dialogs. Preview refreshed to normal user-root resolution on port 5182.
- Strict TypeScript, name guard, all 25 repository-pinned strict spec/change validations and whitespace checks passed. Detailed command record: `.artifacts/onboarding-verification.md`.
- An additional full embedded build/test command reached its 300-second harness timeout. Its retained log reports completed builds/tests with zero failures, but no successful process exit is claimed; remote final-head CI remains the integration gate. No tests or timeouts were weakened. Earlier live-smoke default-config files were preserved rather than cleaned up.
