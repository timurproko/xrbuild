# Verification: ready-PR refresh

## Implemented and checked locally

- `node --test tools/pr-automation/*.test.mjs tools/repo-governance/*.test.mjs`: 88 tests passed. Covers refresh decisions/API client, trusted workflow wiring, existing promotion/finalization/delivery checks, and governance activation profiles/readback.
- `pnpm check:types`: passed after incorporating current main (`5e2c5cd746b7a425f5bf375d5bf6feb077570275`).
- `pnpm check:names`: passed, no banned names.
- `npx --yes @fission-ai/openspec@1.11.0 validate refresh-ready-pull-requests --strict --no-interactive`: passed.
- `git diff --check`: passed.
- `pnpm governance preflight`: read-only, exited 2 with only the expected `trusted-policy-bootstrap` blocker because the new trusted workflow/scripts are not on main yet. Actions are enabled and bot settings are present; this is not certification of installation permissions or event production. No hosting apply was attempted.

## Behavior covered

- Bounded listing completes before writes. Fresh eligible head/main snapshots bind each expected-head update; current branches and ineligible candidates receive no mutation.
- Accepted updates, concurrent-head races, conflicts, malformed responses, credential aborts and independent failures have distinct bounded outcomes. Arbitrary response bodies/credentials are not logged.
- Trusted default-branch workflow uses pinned actions, a current-repository App token scoped to Contents/Pull requests write, non-canceling global concurrency and a ten-minute timeout. No candidate dependencies/scripts/artifacts, PR merges, ready mutations or fabricated checks are used.
- Full activation includes the explicit privileged refresh role, CI-only disables it, and protection-only leaves workflow states unchanged. Existing required check producer, non-strict status policy, squash-only main integration, no-bypass protection and disabled auxiliary workflows are retained.

## Remaining observations and ownership

- Trusted promotion, bot finalization and exact-final-head remote CI are integration gates observed only after the completed draft is pushed; no future pass is claimed here.
- Only the maintainer decides whether and when to merge this PR. No agent merge, auto-merge or live settings mutation was performed.
- After merge, inspect trusted-main preflight and workflow registration. Any hosting repair needs a separately approved confirmed apply.
- Live automatic refresh acceptance remains unobserved before merge. Observe an authorized real merge with a stale eligible ready PR, then record the App update, resulting head and downstream CI run. A prior one-time manual refresh is not proof of this workflow. No extra canary PR/merge is authorized just for acceptance.
