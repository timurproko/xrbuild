## Why

`pr-delivery-automation` adds workflows that GitHub runs only from `main`'s copy (`pull_request_target`, `workflow_run`,
`schedule`, `workflow_dispatch`), so they could not run end to end before it merged. This change checks each of them
live on the repository, fixes what the checks find, and is the first change the repo bot finalizes.

The first live run showed that the weekly governance drift workflow and the bot probe read the repository's settings,
which needs the App to have administration access. Nothing else the bot does needs it, and the App is shared with
another repository, so the settings check stays a local maintainer command and the App keeps the narrower permissions.

## What Changes

- Remove the governance drift workflow and its `governance-drift` label; `pnpm governance check` is run locally by the
  maintainer with their own credentials.
- The bot probe reads only what the bot workflows use (repository, pull requests, issues).
- `protect-main` gets no bypass actors: the first rollout PR was merged by an admin click while `Delivery` still
  failed, so its change reached `main` unfinalized; this PR continues it.
- Apply the governance file once (creates the workflow labels) and confirm `check` is clean.
- Run the bot probe, with and without the App id.
- Watch one docs-only PR merge by itself and start CI on `main`.
- Deliver this change through its own linked PR: a refused finalization while a task is open, then the bot's
  finalization commit, CI rerunning and `Delivery` turning green.
- Run the reconcile and nightly triage workflows once each.
- Fix in this PR whatever the checks show is wrong.

## Capabilities

### Modified Capabilities

- `repository-governance`: the drift check is local only; no workflow reads the repository's settings; the
  `protect-main` ruleset has no bypass actors.

## Impact

- `.github/workflows/governance-drift.yml` removed; `bot-probe.yml`, `config/github-repository-governance.json`,
  README and `.claude/CLAUDE.md` updated.
- GitHub App: Administration permission no longer needed (repository permissions Contents, Pull requests, Issues read
  and write; Metadata read).
- Workflows and scripts from `pr-delivery-automation`, only where a check fails.
