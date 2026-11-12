# Proposal: refresh stale ready pull requests

## Why

Merging a PR advances `main` but does not update other open PR branches or start new integration checks for them. An otherwise complete PR can retain old checks, including a stalled aggregate, until someone updates its branch manually. The existing main-push CI lane validates main, not those PR heads.

## What changes

- Add a trusted post-merge reconciliation that brings every eligible stale ready PR branch up to date with current `main` through GitHub's update-branch API.
- Use the existing repository App identity so accepted branch updates emit ordinary PR synchronization events and start fresh finalization/delivery/CI checks.
- Bound eligibility to open, non-draft, same-repository PRs targeting `main`; re-read identity and head, compare against fresh main, and bind each mutation to the expected head SHA.
- Report already-current branches, drafts/forks, concurrent head changes, merge conflicts and operational failures distinctly without force pushes, readiness changes, PR merges or fabricated statuses.
- Declare the new privileged workflow role in governance, retain CI-only mode's exclusion of privileged automation, and document rollout and the difference between branch refresh and rerunning an old workflow.

## Capabilities

### Modified

- `ci-validation`: automatic refresh of stale ready PRs after main advances, with normal checks on the updated heads.
- `repository-governance`: explicit declaration and activation handling for trusted branch-refresh automation.

## Boundaries

This draft contains planning only. Implementation requires maintainer approval. It changes no live workflow state, repository setting, required-check policy, bot permission, visibility or billing. It grants no merge, auto-merge, force-push, private-workspace or cleanup authority. Existing inactive documentation auto-merge stays inactive. A separately requested one-time PR branch update is operational work, not implementation or proof of this automation.
