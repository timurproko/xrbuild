# Proposal

## Why

The core now takes changes only through PRs with one required check, but the delivery around them is manual and
unchecked: agents follow rules written in `CLAUDE.md` with no plan-approval step, an OpenSpec change is archived by
hand (or not at all) before merge, repository settings were applied once by hand and can drift, and nothing runs the
full checks on `main` between PRs. Agents doing the work in parallel need one written process, and the steps a person
forgets (archive, settings, a failing `main`) need automation that checks or does them.

## What Changes

- **Change-delivery skill.** One skill (`.claude/skills/change-delivery/`) holds the delivery process for agents:
  a task gets its own worktree, branch and draft PR; the PR first holds only the OpenSpec plan; code follows only after
  the maintainer approves the plan, in the same branch and PR; the agent hands off and never merges.
- **PR body contract.** PR bodies have `## Proposal`, `## Implementation`, then `## Acceptance` once implemented, and a
  final collapsed `## Automation` block whose fenced JSON links the PR to its OpenSpec change. The template and a parser
  share one definition.
- **Agent scratch and worktree lifecycle.** A git-ignored `.artifacts/` folder per worktree takes PR bodies, logs and
  patches. `pnpm worktree` gains `sweep` (classify every task worktree as active, merged, closed or dirty, and remove the
  merged clean ones) and `handoff` (record worktree, branch, change, PR and head).
- **OpenSpec finalization bot.** When a PR linked to a change is ready (and on every later push), a workflow running as
  the repo's GitHub App archives the change in the PR branch (`openspec archive`, specs synced), commits
  `docs(openspec): finalize <change>` and updates the automation block. CI's new delivery check fails until the linked
  change is archived, so code, specs and archive reach `main` in one squash commit. A nightly reconcile reports active
  changes on `main` whose PR has merged.
- **CI readiness and trusted policy.** Draft PRs skip the Node and host jobs (name guard and OpenSpec still run); the
  delivery and readiness scripts run from the base commit, not the PR's.
- **Docs auto-merge on the App.** Docs-only auto-merge arms with the App's token so the merge commit triggers CI on
  `main`; a PR linked to a change, or touching an active change, is never auto-merged.
- **Repository settings as code.** `config/github-repository-governance.json` declares repository settings, the
  `protect-main` ruleset and labels. A `check` reports drift (scheduled in CI with the App's read access) and an `apply`
  (local, maintainer's credentials, explicit confirm flag) writes them.
- **Nightly run and triage.** CI runs every job on `main` each night regardless of path filters. When it fails, a triage
  workflow opens or refreshes one draft PR `fix/nightly-<date>` holding an OpenSpec change scaffold with the failure
  summary; it never merges. Hosted runners have no 3D display, hand tracker or GPU: the nightly run covers builds and
  unit tests, not rig checks.

Non-goals: package publishing and releases, a `develop` branch (trunk on `main` stays), an upstream dependency bot,
comment or architecture policy checks.

## Capabilities

### New Capabilities

- `change-delivery`: how a change travels from task to merged and archived: skill, worktrees, PR body, plan approval,
  finalization, auto-merge rules, handoff.
- `ci-validation`: what CI runs for a PR, a draft, `main` and the nightly run, the required check, and nightly triage.
- `repository-governance`: repository settings, ruleset and labels declared in a file, drift check and apply.

### Modified Capabilities

None.

## Impact

- New: `.claude/skills/change-delivery/`, `config/github-repository-governance.json`, workflows
  `openspec-finalization.yml`, `openspec-reconcile.yml`, `governance-drift.yml`, `nightly-triage.yml`; scripts under
  `tools/pr-automation/`, `tools/repo-governance/`; `sweep`/`handoff` in `tools/worktree/`.
- Changed: `.github/workflows/ci.yml` (readiness, delivery, schedule, base-commit policy),
  `.github/workflows/docs-auto-merge.yml` (App token, change-linked PRs excluded), `.github/pull_request_template.md`,
  `.gitignore` (`.artifacts/`), `.claude/CLAUDE.md`, `openspec/config.yaml`, `README.md`.
- GitHub: a GitHub App installed on the repo (contents, pull requests, issues: read and write; administration: read),
  its id as the Actions variable `XRB_BOT_APP_ID` and its private key as the secret `XRB_BOT_PRIVATE_KEY`.
- No change to the host, the plugin ABI, the SDK, the panel or packages.
