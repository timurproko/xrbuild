## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Workspace direct push
Only changes inside `.xrbuild/` SHALL reach `main` without a PR. The tracked `pre-push` hook SHALL refuse a push to
`main` that contains a commit touching any path outside `.xrbuild/`, and SHALL refuse deleting `main`.
`pnpm workspace:push -m <message>` SHALL stage only `.xrbuild/`, refuse when paths outside it are staged, commit
`chore(workspace): <message>`, rebase on `origin/main` and push. Agents SHALL NOT push to `main`, workspace changes
included.

#### Scenario: Renaming a section
- **WHEN** the maintainer moves projects to another section in the panel and runs `pnpm workspace:push -m "move apps to CORE"`
- **THEN** one commit with the renames and the updated `xrb-panel.json` lands on `main` without a PR

#### Scenario: Core file in the push
- **WHEN** a commit pushed to `main` also edits a file in `packages/`
- **THEN** the pre-push hook refuses the push and names that file, and the change goes through a PR

#### Scenario: Core file staged
- **WHEN** `pnpm workspace:push` runs while a core file is staged
- **THEN** it commits nothing and names the staged paths outside `.xrbuild/`
