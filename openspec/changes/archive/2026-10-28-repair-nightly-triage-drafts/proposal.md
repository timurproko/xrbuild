# Repair nightly triage drafts

## Why

The nightly triage workflow is already meant to open a draft repair PR after scheduled CI fails, but it currently
uses the repository App token to read Actions runs and logs. The App deliberately has no Actions permission, so the
triage stops with HTTP 403 before it can decide whether the nightly was green or create the draft. The generated
body also predates the repository's trusted draft-promotion contract, leaving an agent without the normal scoped
implementation checklist and acceptance outcome.

## What Changes

- Read the completed CI run, failed jobs and job logs with the trusted workflow token; use that token for labels and
  comments too, while retaining the repository App token for the branch push and pull-request creation that must
  trigger downstream workflows.
- Generate nightly repair drafts in the ordinary delivery layout: a scoped proposal naming the failed run and jobs,
  two unchecked implementation outcomes, one acceptance outcome and the linked OpenSpec automation block.
- Put the detailed evidence—the run link, failed steps and bounded log excerpts—in the initial triage comment and the
  generated change design so an agent can start from the PR without reconstructing the failure from email.
- Keep repeat failures and the next green nightly attached to the same open `nightly-failure` PR.

## Capabilities

### Modified Capabilities

- `ci-validation`: nightly triage can read Actions evidence with least privilege and opens an actionable repair draft.

## Impact

- `.github/workflows/nightly-triage.yml`: grants the workflow token read-only Actions access plus issue-comment and
  label access, and passes it separately from the App token.
- `tools/pr-automation/nightly-triage.mjs`: separates read and write credentials and renders the actionable draft,
  evidence comment and OpenSpec scaffold.
- `tools/pr-automation/nightly-triage.test.mjs` and CI policy tests: cover the credential boundary, generated delivery
  layout and evidence placement.
