# Spec Delta

## Purpose

Keeps the GitHub repository's settings, the `main` ruleset and the labels the automation relies on in a reviewed file,
with drift reported and changes applied only by the maintainer.

## ADDED Requirements

### Requirement: Declared repository state
`config/github-repository-governance.json` SHALL declare the repository's merge settings, the Actions default workflow
permissions, the `protect-main` ruleset and the labels the workflows use. Changes to it SHALL go through a PR like any
other file.

#### Scenario: Reviewing a settings change
- **WHEN** the maintainer wants merge commits allowed again
- **THEN** the change is a PR editing the file, and the live setting changes only after an apply

### Requirement: Drift check
`tools/repo-governance/governance.mjs check` SHALL compare only the declared keys with the live repository and exit
with an error and a readable difference when they disagree. A scheduled workflow SHALL run it with the App's read
access and open or update an issue on drift.

#### Scenario: Setting changed in the web UI
- **WHEN** someone turns on rebase merging in the repository settings
- **THEN** the next drift check fails and the issue names `allow_rebase_merge` with the declared and live values

### Requirement: Confirmed apply
`governance.mjs apply` SHALL write the declared state only with `--confirm apply-xr-build-governance`, with the caller's
own credentials, SHALL NOT delete rulesets or labels the file does not declare, and SHALL run the drift check after
writing.

#### Scenario: Apply without confirmation
- **WHEN** `apply` runs without the confirm flag
- **THEN** it prints what it would change and writes nothing
