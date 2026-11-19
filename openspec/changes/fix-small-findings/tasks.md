## 1. `names add --exact` bans a common word in its capitalised exact spelling

- [ ] 1.1 Move the common-word refusal into an exported helper that lets `--exact` through when the spelling has an upper-case letter
- [ ] 1.2 Keep refusing an all-lower-case exact spelling without `--force`, with a message that names only the options that apply
- [ ] 1.3 Tests cover a refused plain common word, an accepted capitalised exact common word, a refused lower-case exact common word, and `--force`

## 2. The nightly triage test validates its scaffold with the shared OpenSpec version

- [ ] 2.1 `nightly-triage.test.mjs` runs `delivery openspec validate` from the shared workflow copy (`XRB_WORKFLOW_HOME` or `~/.workflow`) and fails clearly when the copy is missing
- [ ] 2.2 Remove the `@fission-ai/openspec` dev dependency from `tools/pr-automation/package.json` and refresh `pnpm-lock.yaml`
- [ ] 2.3 The CI Node tests job provides the shared workflow copy and sets `XRB_WORKFLOW_HOME` before running tests
- [ ] 2.4 Update `docs/development.md` where it describes the pr-automation tests' OpenSpec dependency
