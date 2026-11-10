# repository-governance Specification

## Purpose
Keeps the GitHub repository's settings, the `main` ruleset and the labels the automation relies on in a reviewed file,
with drift reported and changes applied only by the maintainer.

## Requirements

### Requirement: Declared repository state
`config/github-repository-governance.json` SHALL declare the repository's merge settings, the Actions default workflow
permissions, the `protect-main` ruleset and the labels the workflows use. The `protect-main` ruleset SHALL have exactly
one bypass actor, the repository admin role, so only the maintainer can push to `main` directly; the repo bot and
other collaborators SHALL NOT bypass it. Changes to the file SHALL go through a PR like any other file.

#### Scenario: Reviewing a settings change
- **WHEN** the maintainer wants merge commits allowed again
- **THEN** the change is a PR editing the file, and the live setting changes only after an apply

#### Scenario: Merging before the checks
- **WHEN** the maintainer marks a PR ready while `Delivery` is still failing
- **THEN** the PR merges through the normal merge button only after `CI required` passes, and the delivery flow never uses the admin bypass to merge a PR

#### Scenario: Bot push to main
- **WHEN** a workflow with the App's token pushes to `main`
- **THEN** the ruleset refuses it

### Requirement: Drift check
`tools/repo-governance/governance.mjs check` SHALL compare only the declared keys with the live repository and exit
with an error and a readable difference when they disagree. The maintainer SHALL run it locally with their own
credentials; no workflow SHALL read the repository's settings, so the repo bot needs no administration access.

#### Scenario: Setting changed in the web UI
- **WHEN** someone turns on rebase merging in the repository settings
- **THEN** the next `check` exits with an error naming `repository.allow_rebase_merge` with the declared and live values

#### Scenario: Bot permissions
- **WHEN** the bot workflows run
- **THEN** none of them reads the repository's settings or rulesets, and the App works without administration access

### Requirement: Confirmed apply
`governance.mjs apply` SHALL write the declared state only with `--confirm apply-xr-build-governance`, with the caller's
own credentials, SHALL NOT delete rulesets or labels the file does not declare, and SHALL run the drift check after
writing.

#### Scenario: Apply without confirmation
- **WHEN** `apply` runs without the confirm flag
- **THEN** it prints what it would change and writes nothing

### Requirement: Governance target identity
The governance tool SHALL accept the core repository name `xrbuild` and SHALL reject other repository names before reading or writing their settings. The existing explicit apply confirmation SHALL remain required.

#### Scenario: Core repository
- **WHEN** a maintainer checks governance for a repository named `xrbuild`
- **THEN** the tool compares declared settings without rejecting the core's name

#### Scenario: Private workspace or archive
- **WHEN** governance is invoked for a repository with a different name
- **THEN** it refuses before making any settings API request
