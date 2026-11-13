# Portable planning and scoped authorization

Task identity is the explicit repository, base/head branch, change and PR, not a local directory. Planning-only
publication and GitHub administration can use ordinary CLI/API from any directory without a checkout, A1,
installation or sweep. Implementation still needs an owned isolated checkout. The authority owner is
[change-delivery — Authorization and operation scope](../.claude/skills/change-delivery/SKILL.md#authorization-and-operation-scope).
Root instructions link that policy; this runbook does not alter OpenSpec skills or lifecycle.

| Request | Authorized work | Not implied |
| --- | --- | --- |
| Plan/publish a planning draft | Public analysis, real selected change artifacts, unchecked draft | Implementation, setup, merge |
| Edit only | Isolated local edits and appropriate checks | Commit, push, PR metadata |
| Deliver through a PR / work on an existing implementation PR | Approved task's code, tests, commits, pushes and truthful PR metadata | Merge, private export, deletion, hosting apply |
| Clear approval of scope together with implementation request | Implement that scope without another ritual turn | Self-approval of unresolved material changes |
| Wording clarification | Clarify existing intent | Expanded behavior, ownership or safety authority |

Material scope changes require renewed approval before affected code. A clean tree, detached session, green CI
or successful attachment supplies no publication, cleanup or integration permission.

## Ordinary remote operations

Use an explicit repository for every operation: GitHub CLI supports `--repo owner/repository` for PR operations,
`--body-file -` for a body on stdin, and `gh api repos/owner/repository/... --input -` for JSON on stdin.
Do not rely on ambient cwd, `GH_REPO` or another task's scratch. Resolve the selected base and head, inspect existing
refs and PRs (including closed PRs), and publish real change artifacts through normal GitHub commit/tree APIs.
Create refs without replacement; existing work needs an observed expected head and non-force history preservation.

A planning draft has the repository's Proposal / unchecked Implementation / final Automation linkage. Keep tasks
unchecked, and validate the project artifacts using the unchanged OpenSpec tooling. Publication validation is not
OpenSpec validation, approval, implementation completion, readiness or acceptance. No placeholder code diff or
separate plan merge is necessary. Framework requirements still apply; report a conflict rather than overriding them.

No-checkout payloads may use stdin, memory or isolated secret-free session scratch. Implementation scratch stays
in its owning checkout's ignored `.artifacts/`. Durable handoff identifies repository, branch, change/PR, observed
remote head and remaining work; it needs no local registration. Never publish private repositories, inventories,
client information, credentials or unapproved source. Neither filename filtering nor the name guard proves export
approval or confidentiality: review the entire payload before transmitting it.

## Optional bounded publisher

`tools/worktree/publish-plan.mjs` is an optional dependency-free Node entrypoint; use its absolute path from any
directory and send one JSON object on stdin. It invokes authenticated `gh api` against explicit github.com API
paths, not caller files. It never invokes Git, A1, dependency setup, cleanup, readiness or merge. Ordinary CLI/API
operations remain available without this helper or a locally installed repository runtime.

Payload fields:

- `repository`, `base`, `head`, `change`: explicit public target identity, with distinct base/head.
- `title`, `body`: real planning-draft metadata; body links only this active change.
- `files`: objects with exactly `path` and text `content`. Only this change's `proposal.md`, `design.md`, `tasks.md`,
  `.openspec.yaml` and `specs/<capability>/spec.md` are accepted. Proposal/design/tasks are required. This is a
  publication allowlist, not an alternative OpenSpec schema or a reason to change generated assets.
- `publicReviewed: true`: explicit caller attestation of confidentiality/export review for the whole payload.
- `expectedHead`: required observed commit SHA when continuing an existing remote branch; never a force flag.
- `expectedBase`: optional observed base SHA to bind publication to an earlier reviewed base candidate.

For example, the identity portion of a payload is:

```json
{
  "repository": "example/public-core",
  "base": "main",
  "head": "docs/public-plan",
  "change": "public-plan",
  "publicReviewed": true
}
```

This fragment is not a publishable plan: supply the real title, body and selected file contents. There is no
source-directory option, implicit recursive upload, automatic credential discovery in files, ref deletion or
private-history import. The helper bounds payload size and artifact count, checks public names, and refuses
obvious credential mistakes without echoing payloads or API response bodies. This is defense in depth, not a
secret scanner or export audit. Authentication remains with GitHub CLI; do not put credentials in the payload.

## Races and recovery

1. New branches use create-only refs. Existing branches require an exact expected head and a plan-only diff,
   including rename sources. Divergent/behind branches or implementation changes are not rewritten by this helper.
2. Before a ref write, base/head are read again. Commits have exactly the observed parent; non-force updates
   reject concurrent divergent descendants. An API race fails, rather than force-replacing work.
3. PR discovery includes closed drafts and retains the same task. An identical draft is reused; mismatched,
   duplicate or closed PRs require explicit reconciliation. Concurrent metadata is never overwritten.
4. If ref publication succeeds but PR publication fails, the error names the retained head. Inspect remote state,
   then retry with that `expectedHead` and the same payload. An unchanged tree creates no new commit. If a PR
   already exists but differs, inspect it and resolve the intended metadata explicitly; do not create another task.
5. Report failed/partial publication honestly. Do not delete refs/PRs to make retries pass. No local clean/detached
   status proves publication. Output records only observed public identity/head and PR, not machine-local paths.

Focused mocked fixtures live in `tools/worktree/publish-plan.test.mjs`; they make no GitHub writes. No live
publication, workflow activation, merge, private export or destructive cleanup is part of those checks.
