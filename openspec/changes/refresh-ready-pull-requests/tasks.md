## 1. Guarded ready-PR refresh

- [x] 1.1 Implement bounded same-repository ready-PR listing, fresh identity/head/main comparisons and expected-head update-branch decisions; verify focused Node fixtures cover drafts, forks, closed/wrong-base PRs, malformed data, pagination limits, current branches and stale candidates.
- [x] 1.2 Add the App-only trusted API entrypoint and disposition reporting; verify fixtures cover accepted updates, head races, already-current responses, conflicts, independent candidate failures, credential aborts, bounded requests and no forbidden writes or workflow-token fallback.

## 2. Trusted post-merge workflow

- [ ] 2.1 Add the trusted-default-branch refresh workflow for merged main PRs and the dormant documentation-auto-merge completion bridge, using a scoped App token, global non-canceling concurrency and a bounded timeout; verify workflow-policy tests require trusted checkout, read-only workflow permissions, no candidate execution and normal downstream PR events rather than status writes or PR merges.

## 3. Governance and operator guidance

- [ ] 3.1 Declare the refresh role and trusted files and extend activation validation, planning and readback; verify governance fixtures enable refresh only in full activation, disable it in CI-only activation, preserve protect-only workflow state, reject unknown roles/missing trusted policy and retain existing required checks and no-bypass rules.
- [ ] 3.2 Document eligibility, conflict/race handling, event-producing credentials, rollout prerequisites and stalled-run limits; verify focused automation/governance tests, the name guard and strict change validation pass and guidance does not claim unobserved live refresh or authorize merges/hosting applies.
