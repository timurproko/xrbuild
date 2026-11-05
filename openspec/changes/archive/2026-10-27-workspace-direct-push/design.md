# Design

## Server side: admin bypass

GitHub rulesets cannot scope a rule by path, so a workspace-only exception cannot be expressed on the server. The
ruleset gets `{ "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }` (the admin role). On this
personal repository only the owner holds it; the repo bot's App token does not, so automation still cannot push to
`main`.

Side effect: on a PR the admin also sees GitHub's "bypass rules" merge checkbox. It is an explicit opt-in, and the
delivery skill already forbids merging before `CI required`; the spec scenario "Merging before the checks" changes
from "no bypass offered" to "the delivery flow never uses it".

## Client side: path scope

`.githooks/pre-push` keeps `git lfs pre-push "$@"` and then runs `node tools/workspace-push/workspace-push.mjs
check-push "$@"`. Git passes refs on stdin once, so the hook saves stdin and feeds both. For each line whose remote ref
is `refs/heads/main`, the check lists the files of every commit in `<remote-sha>..<local-sha>` (`git log
--name-only`) and refuses the push, naming the offending files, when any path is outside `.xrbuild/`. Deleting `main`
is refused. Pushes to other branches are untouched. This is a guardrail against mistakes, not a security boundary:
`--no-verify` skips it, as with the name guard's pre-commit hook. `pnpm hooks` already points `core.hooksPath` at
`.githooks`, so there is no new setup step.

## Command

`workspace-push.mjs push -m <message>` (script `workspace:push`):

1. Refuse unless the checkout is on `main` and no rebase or merge is in progress.
2. Refuse if the index already holds staged paths outside `.xrbuild/`.
3. `git add -A -- .xrbuild` (the workspace ignore rules keep builds, `node_modules` and credentials out).
4. Nothing staged: print "nothing to push" and exit 0.
5. Commit `chore(workspace): <message>`; the name-guard pre-commit hook runs as usual (the workspace is exempt).
6. `git pull --rebase origin main`, then `git push origin main`; the pre-push check runs.

Renames show as renames because both sides are staged together. Deleting a project folder in the panel stages as
deletions.

## Alternatives considered

- **Auto-merging workspace-only PRs** (like the docs auto-merge): keeps "no bypass actors", but every workspace edit
  still needs a branch and waits for CI. Rejected because the request is a direct push; it can replace the bypass
  later if the bypass proves too loose.
- **Panel "Commit and push" button**: convenient, but the panel would then hold Git write logic. The command comes
  first; a button can call it later.

## Verification

Unit tests in `tools/workspace-push` against a temporary repository with a bare remote: a workspace-only commit
pushes; a commit touching a core file is refused by the hook check; staged core files block the command; nothing to
push exits 0. Governance tests cover the declared bypass actor in the drift diff. After merge, the maintainer applies
the governance file and pushes a workspace change.
