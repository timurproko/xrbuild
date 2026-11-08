## ADDED Requirements

### Requirement: Completed-draft blockers are visible
Trusted readiness SHALL distinguish ordinary incomplete implementation from a fully checked PR body whose authoritative pre-ready inputs remain invalid or unfinished. An incomplete implementation SHALL remain draft with a stable skip reason. A fully checked body with missing or open detailed tasks, invalid acceptance, association or gap disposition SHALL remain draft with an actionable visible blocking result. Neither case SHALL be repaired by checking unfinished work or bypassing policy. Post-ready CI SHALL remain an integration gate rather than a future result falsely declared as completed implementation.

#### Scenario: Implementation still has an unchecked outcome
- **WHEN** an opted-in draft contains an unchecked valid Implementation item
- **THEN** trusted automation leaves it draft with a stable incomplete reason without running ready-only test suites

#### Scenario: PR body and task ledger disagree
- **WHEN** every PR-body Implementation item is checked but an authoritative pre-ready task remains unfinished
- **THEN** trusted automation reports a visible blocking reason and does not mark the PR ready or rewrite its ledger

#### Scenario: Code and tests await final CI
- **WHEN** implementation, written tests and pre-ready bookkeeping are complete but post-finalization CI has not yet run
- **THEN** the candidate may enter the ordinary ready/finalization path without claiming that future CI passed

### Requirement: Governance bootstrap does not bypass integration
Policy changes SHALL begin as isolated plan-only drafts, receive maintainer approval before implementation and use trusted default-branch policy for readiness. Where that trusted path is not yet configured or does not support the candidate contract, the maintainer SHALL review the declared bootstrap path. An agent SHALL not merge, push default-branch code, temporarily relax protection or execute candidate policy with privileged credentials to make governance configure itself. Existing drafts SHALL be reconciled explicitly after activation.

#### Scenario: New policy is absent from the trusted default branch
- **WHEN** a proposed policy requires behavior not yet installed on the trusted default branch
- **THEN** its own untrusted head cannot grant readiness or integration authority and the declared maintainer-reviewed bootstrap remains required

#### Scenario: Existing pushes predate activation
- **WHEN** automation is activated after eligible drafts were last updated
- **THEN** an approved bounded reconciliation inspects their current exact snapshots rather than assuming old events will replay or promoting incomplete candidates

## MODIFIED Requirements

### Requirement: Documentation auto-merge
When explicitly enabled by the reviewed workflow activation policy, a ready same-repo PR to `main` that changes only documentation (`docs/`, `openspec/`, Markdown outside `.claude/` and `.github/`), does not link a change, touches no active change folder and has no `no-auto-merge` label SHALL get squash auto-merge armed with the App's token, so its merge starts CI on `main`. Auto-merge armed by the automation SHALL be removed when the PR stops qualifying; auto-merge armed by a person SHALL be kept. Delivery activation MAY leave this auxiliary workflow disabled and SHALL not imply that documentation auto-merge is active. Implementation PRs SHALL never become eligible through this path.

#### Scenario: Docs fix
- **WHEN** the documentation workflow is explicitly enabled and a ready qualifying PR changes only `README.md`
- **THEN** it merges by itself once `CI required` passes and starts CI on `main`

#### Scenario: Auxiliary workflow is disabled
- **WHEN** the reviewed activation profile leaves documentation auto-merge disabled
- **THEN** no automatic merge is claimed and enabling delivery CI alone does not arm it

#### Scenario: Plan only
- **WHEN** a PR adds only an active change folder
- **THEN** it is not auto-merged
