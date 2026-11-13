---
name: change-delivery
description: Repository command details for delivering XR Build changes under the shared delivery contract. Read before planning, implementing, updating or finishing a PR.
---

# Change delivery commands

Read and follow [Shared delivery rules](../../../docs/delivery-rules.md) using only the `xrbuild` entry in
[Delivery adapters](../../../docs/delivery-adapters.json). The root route is [AGENTS.md](../../../AGENTS.md).
This skill supplies command syntax and repository integration details, not alternative delivery policy.

Product/private/security instructions: [project instructions](../../CLAUDE.md). Repository-owned governance
operations: [protected PR delivery](../../../docs/pr-delivery-governance.md). Planning publisher:
[portable planning](../../../docs/portable-planning.md). OpenSpec scope: [R01](../../../docs/delivery-rules.md#r01---scope-and-unchanged-openspec).

## Repository routing and dependencies

- `pnpm task:repos` reads ignored `.artifacts/repositories.json` for explicit repository routing, independent private
  provisioning and create-only tested-revision records. See [embedded extensions](../../../docs/embedded-extensions.md)
  and the selected change's `prerequisites.md` for public/private boundaries and ordered dependencies.
- Read the independently provisioned private clone's `CLAUDE.md` and affected plugin instructions for private work.
  Core/embedded-only work has no private-clone dependency. The private clone is not a submodule or junction.
- Repository helper syntax: `pnpm worktree add|enter <type/short-desc>`. Current legacy helpers install public
  dependencies and restrict re-entry; portable adoption and dirty-resume changes are still implementation work in
  PR #19. For task-local dependency setup, the package-manager command is `pnpm install --frozen-lockfile`.
- A1 entry/attachment syntax is in [Delivery adapters](../../../docs/delivery-adapters.json). External-agent
  operations use ordinary Git. Resume/context policy: [R04](../../../docs/delivery-rules.md#r04---isolated-implementation-and-resume).

## Planning payloads and PR metadata

- Selected project artifacts live in `openspec/changes/<change-id>/`: `.openspec.yaml`, `proposal.md`, `design.md`,
  `tasks.md` and specification deltas. The supported no-spec marker is `skip_specs: true` in `.openspec.yaml`.
- Ordinary GitHub CLI/API and the optional `tools/worktree/publish-plan.mjs` are documented in
  [portable planning](../../../docs/portable-planning.md). The helper consumes one reviewed JSON payload on stdin.
- PR body layout: [pull request template](../../../.github/pull_request_template.md). The machine link uses the
  `openspec-implementation` fence with `{"version":1,"change":"<change-id>"}`. Intermediate version-1 delivery
  retains the `openspec-in-progress` label. Inspect existing archive/history when resuming finalized work.
- Checkout-local body file: `.artifacts/pr-body.md`; GitHub CLI accepts `--body-file`. Remote payload syntax and
  supported input fields are in the planning runbook. Authority and progress: [R02](../../../docs/delivery-rules.md#r02---authority),
  [R03](../../../docs/delivery-rules.md#r03---portable-planning), [R05](../../../docs/delivery-rules.md#r05---progress-and-publication).
- Title/commit syntax is `type(scope): subject`; product instructions list scopes and attribution constraints.

## Focused verification and trusted automation

- Name guard: `pnpm check:names`. Public TypeScript: `pnpm check:types`. Focused repository tool tests use
  `node --test tools/<tool>/<selected-file>.test.mjs`; package-specific commands are in the product instructions.
- Strict change validation: `pnpm exec openspec validate <change-id> --strict`. This invokes unchanged OpenSpec.
- Contract installation checks: `node --test tools/worktree/agent-guidance.test.mjs`.
- PR check inspection: `gh pr checks <n>`. Promotion, finalization, hold and readiness policy:
  [R06-R08](../../../docs/delivery-rules.md#r06---validation-and-readiness-structure).
- Trusted repository automation lives in `tools/pr-automation/` and `.github/workflows/`. The finalizer's commit
  title is `docs(openspec): finalize <change-id>`; its archive association is recorded in Automation. Preserve
  that commit when continuing work. Bootstrap/activation command details are in the governance runbook.
- Legacy controller and body-validator changes for the contract remain open in PR #19. Installing this guidance
  is not evidence that those behaviors, exact-head CI or live activation have been observed.

## Handoff and local-operation compatibility

- Legacy local registration: `pnpm worktree handoff <short-desc> --change <change-id> --pr <n>`. It writes
  `.artifacts/handoff.json` and prints a report skeleton. It currently records local state only, not remote
  publication proof or automatic cleanup enrollment. Portable handoff policy: [R12](../../../docs/delivery-rules.md#r12---portable-handoff).
- Published local removal, preservation and runtime boundaries: [R13-R15](../../../docs/delivery-rules.md#r13---explicit-published-local-removal).
  PR #19's exact-target cleanup adapters remain unfinished. The existing `.a1/worktree.json` is a legacy bulk-sweep
  declaration, not a compatible exact-completion interface. Compatible released runtime support is not yet verified;
  report this blocker for exact runtime removal rather than treating legacy `complete`, `discard` or `sweep` as a substitute.
- Existing command inventories are in `tools/worktree/worktree.mjs`; their presence is not contract conformance
  or deletion authority. Scratch/private boundaries: [R16](../../../docs/delivery-rules.md#r16---scratch-and-private-boundaries).

## Accepted public contract checkpoints

See [baseline reconciliation](../../../docs/spec-baseline-reconciliation.md) for repository-specific accepted-public
contract evidence and the selected change's prerequisite ledger for observed predecessor state. Historical records
remain separate from this implementation. Shared scope/finalization policy: [R01](../../../docs/delivery-rules.md#r01---scope-and-unchanged-openspec)
and [R07](../../../docs/delivery-rules.md#r07---trusted-finalization).
