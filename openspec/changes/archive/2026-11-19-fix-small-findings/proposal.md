## Why

Two small defects in repository tooling:

- `pnpm names add <word> --exact` refuses a common word and tells the user to "use --exact", which they already did.
  The tool's header, `README.md` and `docs/confidentiality.md` all define `--exact` as the option for a name whose
  lower-case form is an ordinary word, yet only `--force` gets past the common-word refusal.
- `tools/pr-automation` pins its own OpenSpec CLI (1.11.0) as a dev dependency only so `nightly-triage.test.mjs` can
  validate the generated repair scaffold. Every other OpenSpec use (the CI OpenSpec job, finalization, the
  `delivery openspec` command) runs the one version the shared workflow pins (2.0.0), so the test checks the scaffold
  against a version nothing else uses.

## What Changes

- `name-guard add --exact` bans a common word in its exact spelling when that spelling has an upper-case letter.
  An all-lower-case exact spelling would match the ordinary word itself, so it is still refused without `--force`,
  and the refusal message names only the options that actually apply.
- `nightly-triage.test.mjs` validates the scaffold with the shared workflow's OpenSpec (`delivery openspec`), found
  through the shared workflow copy. The `@fission-ai/openspec` dev dependency and its lockfile entries are removed,
  and the CI Node tests job provides the shared workflow copy before running tests.

Investigated and dropped: the launcher's `scene.add(xrb.handsObject, xrb.cursorObject)` does not show the cursor twice.
`createXrbApp` already adds `cursorObject` to the same scene, and three.js `add` reparents an object instead of
duplicating it, so the scene holds one cursor. The cursor style and the mouse setting are resolved by the SDK for the
launcher like any app, and the SDK README and the launcher test state that the launcher shares the standard cursor.

## Capabilities

### New Capabilities

- `name-guard`: how the name guard adds a banned name, including exact-case names of common words.

### Modified Capabilities

None.

## Impact

- `tools/name-guard/name-guard.mjs` (`add` command) and `tools/name-guard/name-guard.test.mjs`.
- `tools/pr-automation/nightly-triage.test.mjs`, `tools/pr-automation/package.json`, `pnpm-lock.yaml`.
- `.github/workflows/ci.yml` (Node tests job: provide the shared workflow copy).
- `docs/development.md` where it describes how the pr-automation tests get OpenSpec.
