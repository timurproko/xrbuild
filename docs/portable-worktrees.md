# Portable worktree commands

Policy: [Shared delivery rules](delivery-rules.md), especially R04 and R12, using only the `xrbuild` entry in
[Delivery adapters](delivery-adapters.json). This page describes the repository helper and its current adapters.

## Entry points

- `pnpm worktree add <type/short-desc>` prepares an unoccupied task branch in `.worktrees/<short-desc>`.
- `pnpm worktree enter <type/short-desc>` additionally locates an existing registered checkout of that branch,
  including a matching checkout whose directory name differs from the branch suffix.
- `--a1` invokes `a1 worktree attach <absolute-path>` for runtime ownership establishment. Successful exit is the
  confirmation. No runtime inventory inspection or second linkage procedure is performed.
- `--expected-head <sha>` binds the selected local or fetched head to a previously observed immutable commit.
- `--install` explicitly links only public core dependencies and invokes frozen package-manager installation.
  Without that flag, entry does not link dependency folders, install packages or provision a private workspace.

The helper checks repository identity through read-only GitHub CLI repository lookup and verifies primary is on
`main`. It fetches the named live base/proposal refs before adopting an unoccupied remote/local branch. It retains
local descendants, rejects divergent/local-behind task history without integration, and does not restart a vanished
cached proposal from main. Matching owned resumes retain staged/unstaged/untracked edits. Path/link collisions,
foreign registrations, Git locks, missing ownership confirmation and changed heads report errors with files intact.
Scoped acquisition locks are tool-owned Git metadata, not session ownership or cleanup enrollment.

The repository helper's concrete existing-context ownership adapter is currently A1 attachment. Its exported
`acquireOwnership` integration point also accepts a caller-supplied verifier from a trusted runtime; there is no
CLI flag that merely asserts ownership or fabricates runtime identity. An unverifiable helper resume is blocked.
External agents remain free to use ordinary Git worktree operations and work in their owned checkout without A1;
they do not need this optional helper or its runtime adapter. The external editor/runtime retains responsibility
for its context establishment. The Claude Code create hook uses the helper and fails closed when it cannot verify
an existing context; it does not silently take over a registered checkout.

If attachment or explicit installation fails after creation, the registered checkout and branch remain recoverable.
The error is not a successful attachment, dependency result or permission to reset/delete the partial context.

## Portable handoff

`pnpm worktree handoff <short-desc> --change <change-id> --pr <n>` retains the existing local record location,
`.artifacts/handoff.json`, and prints a report skeleton. It includes repository identity status, selected/actual
branch, change/PR, local and observed remote heads, containment evidence and local Git dirty state. It uses
read-only remote inspection and fetches the observed public commit object if required for local ancestry checks.
An equal or descendant live remote tip can prove HEAD publication; an offline, missing, changed or non-containing
remote remains unverified. The report distinguishes HEAD publication from unpublished dirty work and does not
certify ignored/private contents. It never writes remote refs, merges, marks acceptance or enrolls cleanup.

This local registration is optional for remote-only planning: the planning publisher already returns observed
repository, branch, change, head and PR with verified/partial publication status. Use that observed result directly,
without inventing a local path. See [portable planning](portable-planning.md).

Existing local record fields (`worktree`, `branch`, `change`, `pr`, `head`, `time`) remain readable; new evidence
fields add the actual local/remote observations. A linked `.artifacts/` directory or linked/hardlinked record is
refused rather than overwriting another checkout's scratch.

## Verification

Focused fixtures: `tools/worktree/portable-context.test.mjs`, `worktree.test.mjs` and `publish-plan.test.mjs`.
They use isolated Git repositories and mocked runtime/remote operations. Shared-case coverage is tracked separately
under task 5.5; these component checks do not certify every shared case, a compatible cleanup runtime release,
exact-final-head CI, live activation or device acceptance. Cleanup migration remains unfinished in PR #19.
