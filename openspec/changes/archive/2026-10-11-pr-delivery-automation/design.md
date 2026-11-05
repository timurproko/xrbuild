# Design

## Context

See proposal.md for why. State that shapes the approach:

- `main` is protected by the `protect-main` ruleset: PR only, squash only, linear history, required check
  `CI required` (non-strict: a PR need not be up to date), 0 approvals, admins may bypass on a PR. Merged branches are
  deleted; squash commits take the PR title and a blank body.
- `.github/workflows/ci.yml` runs `Changes` (path filters), `Name guard`, `OpenSpec`, `Node tests` (Windows),
  `Host build and tests` (Windows, `third_party/` cached) and `CI required` (collects results; skipped counts as pass).
  It runs on `pull_request`, `push` to `main` and `workflow_dispatch`, from the PR head's copy of the workflow.
- `.github/workflows/docs-auto-merge.yml` runs on `pull_request_target` from `main`'s copy and arms squash auto-merge
  with `GITHUB_TOKEN` for ready docs-only PRs (`tools/pr-automation/docs-auto-merge.mjs`). A merge made with
  `GITHUB_TOKEN` starts no workflow, so `main` gets no CI run after a docs merge.
- A push made with `GITHUB_TOKEN` starts no workflow either: a bot commit on a PR branch made that way would never be
  checked. Pushes made with a GitHub App installation token do start workflows.
- `tools/worktree` (`pnpm worktree add|remove`) makes `.worktrees/<desc>` on `<type>/<desc>` from `origin/main` and
  links the primary checkout's `third_party/` entries as junctions.
- OpenSpec 1.14 is pinned in CI (`npx @fission-ai/openspec@1.14.1`); `openspec archive <change> --yes` moves the
  change to `openspec/changes/archive/<YYYY-MM-DD>-<change>/` and applies its deltas to `openspec/specs/`.
- The agent tool loads project skills from `.claude/skills/` (the OpenSpec skills already live there).
- Hosted runners have no 3D display, hand tracker or GPU suited to the host's display output.

## Goals / Non-Goals

**Goals:**
- One written delivery process an agent can follow without asking, with the maintainer's approval as the only gate
  between plan and code, and the maintainer's merge as the only gate to `main`.
- A merged change always arrives with its specs synced and its folder archived, in the same squash commit.
- Repository settings that match a reviewed file, with drift reported.
- A failing `main` is noticed the next morning, with a draft PR to start the fix from.

**Non-Goals:**
- Package publishing, releases, release branches or tags.
- A `develop` branch: trunk on `main` stays.
- A bot that proposes dependency upgrades; comment, architecture or docs policy checks.
- Running apps on a display or with hands in CI.

## Decisions

### D1. The skill lives in `.claude/skills/change-delivery/SKILL.md`
That is where the agent tool loads project skills from, next to the OpenSpec skills. The skill is short and points to
`openspec/config.yaml` and `.claude/CLAUDE.md` for the rules it relies on, so the process has one source. Another agent
tool can be pointed at the same file from its own instructions.
*Alternative:* an agent-neutral `.agents/skills/` folder; rejected while one agent tool is in use, since it would not
load the skill without extra configuration.

### D2. One PR from plan to merge, linked by a fenced JSON block
The PR body ends with:

```markdown
## Automation

<details>
<summary>Used by CI to link this PR to its OpenSpec change</summary>

~~~openspec-implementation
{"version":1,"change":"<change-id>"}
~~~

</details>
```

(with a backtick fence in the real body). Finalization adds `"archive":"openspec/changes/archive/<date>-<change>"` and
`"finalizedHead":"<sha>"`. `tools/pr-automation/pr-body.mjs` parses and rewrites only this block; malformed JSON, an
unknown version or a change id that is not a folder name fails the delivery check with a message saying what to fix.
A PR without the block is not linked to a change. The template (`.github/pull_request_template.md`) carries the
sections and an empty block to fill or delete.
*Alternative:* a label or the branch name as the link; rejected because neither carries finalization state and both
are easy to get wrong silently.

### D3. Plan first, code after approval, same branch
The draft PR first holds only `openspec/changes/<change>/` (and `.gitignore`-level scaffolding if needed). The agent
stops and hands off; the maintainer reviews and asks for the implementation in words. The agent continues in the same
worktree, branch and PR, updating proposal, design, deltas and tasks before the code they cover. `## Acceptance` (one to
ten plain bullets, no checkboxes) is added when the implementation is complete. A request that mixes "plan and do it"
counts as approval only when the maintainer says so explicitly.

### D4. Finalization runs from `main`, as the App, in the PR branch
`openspec-finalization.yml` runs on `pull_request_target` (`ready_for_review`, `synchronize`, `reopened`, `edited`) for
non-draft same-repo PRs to `main` whose body links a change. It checks out `main` for the scripts and the PR head
(with the App token) into a separate folder, and runs only the pinned OpenSpec CLI and its own scripts on the PR's
files; it never installs or runs the PR's code. `tools/pr-automation/finalize.mjs`:

1. If the linked change is already archived at the head (no active folder, one `archive/*-<change>/`), it only makes
   sure the block records the archive, and stops.
2. If `tasks.md` has open tasks, it fails with the list (the PR stays unfinalized; the delivery check stays red).
3. Otherwise it runs `openspec archive <change> --yes`, runs `openspec validate --all --strict`, commits
   `docs(openspec): finalize <change>` as the App, pushes, and records `archive` and `finalizedHead` in the block.

The push starts CI on the finalized head. Agents pull before pushing again and never revert a finalization commit.
*Alternatives:* agents archive by hand plus a check (simpler, but the step is the one people forget); finalize after
merge in a follow-up PR (a second PR per change, and `main` is briefly out of sync).

### D5. Delivery check: state of the head, not a recorded SHA
A new `Delivery` job in `ci.yml` runs `tools/pr-automation/delivery.mjs` from the base commit (`git show
<base>:tools/...`) on non-draft PRs. It fails when:

- the PR links a change that still has an active folder at the head ("awaiting finalization");
- the block is malformed;
- the PR adds or changes files under an active `openspec/changes/<x>/` (not `archive/`) other than through the linked,
  finalized change, unless the PR has the `openspec-in-progress` label (for a long change delivered over several PRs).

"Finalized" is read from the head's tree (archive present, active folder gone), so commits after finalization that do
not reintroduce the folder keep the check green; `finalizedHead` is informational. `CI required` needs `Delivery` to be
`success` or `skipped`.

### D6. Readiness: drafts skip the heavy jobs
A `Readiness` job reads `draft` from the event. For a draft PR, `Node tests` and `Host build and tests` are skipped;
`Name guard`, `OpenSpec` and `Changes` still run, and `Delivery` is skipped. `ci.yml` adds the `ready_for_review`,
`converted_to_draft` and `edited` types so marking ready (or editing the link) runs the full set. Policy scripts that
decide skipping and delivery are read from the base commit; the workflow file itself necessarily comes from the PR head,
which review covers.

### D7. Docs auto-merge uses the App and never takes a change
`docs-auto-merge.yml` creates an App token for `gh pr merge --auto`, so the eventual merge is attributed to the App and
starts CI on `main`. `planAutoMerge` adds two exclusions: a PR whose body links a change, and a PR touching an active
change folder. A plan-only draft therefore never lands by itself, and a ready one is blocked by the delivery check.

### D8. Nightly reconcile opens one issue
`openspec-reconcile.yml` (nightly and on demand) runs `tools/pr-automation/reconcile.mjs` on `main`: for each active
change folder, it finds merged PRs whose block links it. Any such change (merged but not archived) is listed in one open
issue labelled `openspec-reconcile`, updated in place, and closed when the list is empty. Active changes without a
merged PR are planned work and are not reported.
*Alternative:* open archive PRs automatically; rejected: an unarchived merged change needs a person to see why.

### D9. Settings as code: declared keys only, apply needs a confirm flag
`config/github-repository-governance.json` declares: repository merge settings (squash only, auto-merge, delete branch
on merge, squash title and message), Actions default workflow permissions (`read`), the `protect-main` ruleset (rules,
required check, bypass) and labels (`no-auto-merge`, `openspec-in-progress`, `openspec-reconcile`, `nightly-failure`,
`governance-drift`).
`tools/repo-governance/governance.mjs`:

- `check` compares only declared keys with the live API (rulesets normalised: ids, links and timestamps dropped) and
  exits 1 with a readable diff on drift.
- `apply --confirm apply-xr-build-governance` writes the declared state with the caller's `gh` credentials, never
  deletes an undeclared ruleset or label, and re-runs `check`.

`governance-drift.yml` runs `check` weekly and on changes to the file, with the App token (administration: read), and
opens or updates an issue on drift.
*Alternative:* apply from CI; rejected: settings writes need admin rights the App should not hold.

### D10. Nightly: the same CI, every job, then triage
`ci.yml` gains a `schedule` trigger; any event other than `pull_request` already selects every job, so the nightly run
is the regular CI on `main`'s head. `nightly-triage.yml` runs on `workflow_run` of `CI` when the run's event is
`schedule` and it failed. `tools/pr-automation/nightly-triage.mjs` (App token):

- If no open PR has the `nightly-failure` label, it creates `fix/nightly-<YYYY-MM-DD>` from the failing commit with
  `openspec/changes/fix-nightly-<YYYY-MM-DD>/` (proposal with failed jobs, run link and the last log lines of each
  failed step; empty design and tasks to fill) and opens it as a draft PR with that label and a linked block.
- If one is open, it adds a comment with the new run's summary instead.
- On a green nightly with such a PR open, it comments that `main` is green again at that commit.

It never merges or marks ready. The draft starts the normal D3 flow: an agent or the maintainer plans the fix there.

### D11. Bot identity: one GitHub App
One App, installed on this repository only, with repository permissions Contents (read and write), Pull requests (read
and write), Issues (read and write), Administration (read) and Metadata (read); no webhook. Its id is the Actions
variable `XRB_BOT_APP_ID`, its private key the secret `XRB_BOT_PRIVATE_KEY`; workflows mint short-lived tokens with
`actions/create-github-app-token`. The App is not a ruleset bypass actor: it pushes to PR branches and arms auto-merge,
never to `main`. Without the App configured, the workflows that need it stop with a message naming the missing variable
or secret, and everything else keeps working.

### D12. Worktree sweep and handoff
`pnpm worktree handoff <name> [--change <id>] [--pr <n>]` writes `.worktrees/<name>/.artifacts/handoff.json`
(worktree, branch, change, PR, head commit, time) and prints the handoff report skeleton: worktree, branch and PR,
commit, commands run, behaviour, gaps, and one manual test command. `pnpm worktree sweep [--apply]` lists every task
worktree with a state:

| State | Meaning | `--apply` |
|---|---|---|
| `dirty` | uncommitted changes | kept |
| `active` | PR open, or no PR and commits not on `origin/main` | kept |
| `merged` | PR merged, tree clean | removed (as `remove`) |
| `closed` | PR closed unmerged | kept; `remove --discard` removes it |
| `unknown` | `gh` unavailable or the PR cannot be read | kept |

Sweep never removes anything without `--apply`, and never a `dirty`, `active`, `closed` or `unknown` worktree.

### D13. This change finalizes by hand; a rollout change checks it live
The finalization workflow runs from `main`'s copy, so it does not exist for this PR. This change is archived by hand
(`openspec archive pr-delivery-automation --yes`) as its last task. The workflows that run only from `main` are
checked end to end by the follow-up change `pr-delivery-automation-rollout` (added here, `skip_specs`), whose own PR
is the first one the bot finalizes.

## Risks / Trade-offs

- A malicious PR could change `ci.yml` to skip checks → only collaborators can push branches; policy scripts run from
  the base; workflow edits are visible in review.
- `pull_request_target` with a write token near PR files → the PR's code is never installed or run; only the pinned
  OpenSpec CLI and `main`'s scripts touch the files.
- The App key is a long-lived secret → repository-scoped install, least permissions, rotation documented.
- Finalization and an agent push at the same time → the agent's push is rejected (non-fast-forward); pull and push
  again, as the skill says.
- Nightly cost (about 6 minutes of Windows runner a night) → acceptable on a public repo.
