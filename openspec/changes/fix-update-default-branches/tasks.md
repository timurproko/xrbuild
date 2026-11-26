# Tasks

## 1. Safe fresh default-branch fast-forward

- [x] 1.1 Replace cached-upstream targeting with explicit origin default discovery, explicit branch fetch and a captured validated target; local bare-repository tests cover stale refs, non-main defaults, default rename, narrow refspec and network/discovery failures.
- [x] 1.2 Refuse dirty tracked/staged/untracked paths, detached HEAD, missing/deleted/non-default/non-origin upstreams, ahead-only commits and divergence; tests assert unchanged HEAD, branch, index and files with actionable role-specific messages.
- [x] 1.3 Retain exact-target LFS-before-checkout behavior and recheck local state before fast-forward; tests cover remote movement after fetch, concurrent local edits, LFS failure and clean-clone exclusions without reset, stash or forced commands.
- [x] 1.4 Document the stricter all-dirty refusal and default-branch recovery policy in the owner-facing Update documentation; check that examples never suggest destructive recovery.

## 2. Independent core and workspace outcomes

- [x] 2.1 Orchestrate both repositories with real-path deduplication and per-role before/after commits, fresh-fetch evidence and recovery reasons; two independent bare remotes reproduce stale core success and assert both eligible clones advance.
- [x] 2.2 Continue the second repository after any first-repository refusal/failure and reject with both outcomes on partial failure; matrix tests cover every unsafe state for each role while the other role advances.
- [x] 2.3 Replace workspace-only POST eligibility, CLI exit behavior and read-only-core UI assumptions while retaining all busy guards and index-safe cached status; HTTP/job/CLI/dialog tests assert no false done or up-to-date result and one fetch for identical repository paths.
- [x] 2.4 Update owner-facing Update descriptions for two-repository behavior and partial-failure semantics; targeted tests assert summaries preserve each actual before/after commit and redacted diagnostics.

## 3. Resumable setup, build and activation reporting

- [ ] 3.1 Prepare changed public core dependencies through the existing pinned frozen hook-disabled installer with streamed output; injected installer tests cover successful setup, frozen-lock/config/network failure and no private-package or native-tool installation.
- [ ] 3.2 Keep per-repository pending work until setup and native rebuild finish, invoke the fetched rebuild recipe with the existing host-freshness policy and safely defer builds that would consume refused local work; tests cover core-only changes, workspace-only changes, failures and retry at unchanged HEAD.
- [ ] 3.3 Add explicit final restart-required and not-restarted reporting for changed core or loaded workspace code, including partial failures; job/dialog/CLI tests distinguish updated disk files from the running process.
- [ ] 3.4 Finish README and private-workspace documentation with actual install/build commands, retry behavior and the initial manual-update limitation of old panels; focused regression coverage demonstrates the stale-core and removed-upstream cases without accessing real checkouts.
