# Private workspace split and public-history preparation

## Boundary

Core owns the engine, SDK, panel, generic tools, templates and OpenSpec. The private `.xrbuild` repository owns projects, concrete plugins and pinned integration dependencies. Authorized developers clone it at `<core checkout>/.xrbuild/`, with its own `.git` and Git LFS hooks. Core ignores that entire directory. It is neither a submodule nor a symlink/junction.

Ordinary users need no private-repository access: `XRB_HOME`, otherwise the home `.xrbuild`, remains the default. `panel:repo`, `host:repo`, `fetch-deps:repo` and `start-repo.vbs` explicitly select the current checkout's `.xrbuild/`; they do not select the primary checkout from a task. An optional separate project repository still owns its own app source without duplication.

A core task shares only fetched core `third_party/` entries. If private development is needed, provision a separate private clone in that task and follow its instructions. Never link the primary workspace into it. Private commits/pushes belong to that clone; core changes use the core PR flow. Agents never push main or merge in either repository.

## Cleanup protection

The worktree helper refuses removal if `.xrbuild/` exists (even an unversioned directory or a link), or if `.artifacts/KEEP` exists. Sweep reports these worktrees as dirty/preserved even when outer Git status is clean. Protect migration snapshots with the marker. Before cleanup, the maintainer separately preserves private commits, uncommitted/untracked/ignored files and marked artifacts, verifies their recovery copy, then relocates the protected data. Do not remove a marker merely to get cleanup to pass. Keep recovery snapshots outside disposable worktrees before eventual worktree removal.

## Selected route: fresh core bootstrap

The maintainer chose a new initial commit rather than preserving core history. The workspace repository retains its private history. The original core repository was renamed to a private archive; a separate empty public core destination was created explicitly. Do not use the old checkout's remote for that destination: its origin must point to the private archive.

Export only reviewed tracked core files into empty staging, retain the workflow definitions, initialize a new repository on a bootstrap branch, and create one parentless commit. Never copy the old `.git`, ignored artifacts, workspace, installed dependencies or LFS store. Verify the exact intended file tree, zero private paths/LFS pointers, one reachable commit, and an independent fresh clone. Keep Actions disabled until workflow setup is approved. Only the maintainer performs the initial main push, using the exact audited fresh ref, then verifies another clone from hosting before local cutover.

This route does not require merging the old archive PR or rewriting its history. Preserve the old local checkout and backups, then provision a fresh core clone and independently clone the private workspace into its ignored `.xrbuild/`. Do not casually switch the old checkout to the new unrelated lineage. Configure the new bot App, credentials, governance and required checks afterward; verify draft/readiness, OpenSpec finalization, CI and maintainer merging through a test PR before routine development resumes. Pending canonical OpenSpec synchronization remains for that restored workflow; the bootstrap does not fabricate a bot-finalization commit. Private workspace CI may stay disabled.

Licensing and notices are deferred at the maintainer's request. Public visibility does not itself grant an open-source or commercial license. Confidential-material review and exact push approval remain mandatory before any source upload.

## Original history-preserving alternative and shared safety gates

The stages below retain the original PR/filter-based option and recovery details. For the selected fresh-bootstrap route, omit the old PR merge and history-filter steps and use the parentless snapshot above. A core PR removing `.xrbuild/` does **not** remove historical private files. Keep the original archive and workspace private. No step authorizes production deployment or main pushes by agents.

### 1. Preserve source state

Inventory registered worktrees, every branch/tag/other ref, all stash entries, reflog commits, local changes and private LFS objects. Record exact source and private destination identities, current visibility and selected extraction revision. Do not drop stale branches/stashes simply because their PRs merged.

Create a private recovery snapshot: Git bundle or independent mirror; explicit backup refs for each stash and reflog-only commit; separate LFS objects; binary-capable staged/unstaged patches; all workspace regular files including ignored/local-only files; directory and link inventories. Do not traverse workspace links into arbitrary external directories. Record link targets for deliberate recreation at the new root. A Git bundle alone does not contain LFS binaries, ignored files, or older stash entries kept only by the reflog.

Verify by independently restoring the bundle, checking refs and full Git object connectivity, comparing file SHA-256 hashes, and confirming every historical private LFS pointer resolves to an object with the expected hash/size. Fail the snapshot if source refs or files change while copying. Preserve all credentials/settings privately; never put snapshot contents in a PR or public log. A same-disk snapshot protects against migration mistakes, not disk loss; arrange a separate private off-device copy before destructive cutover when needed.

### 2. Populate the private repository

In isolated staging under the task's ignored artifacts, split the whole `.xrbuild/` subtree at the approved source revision. Compare the extracted root tree to the source subtree, and verify that all historical workspace tree states on the selected source history are retained. Other branches/stashes remain in recovery until explicitly selected; do not silently combine their unfinished work into the workspace's main history.

Add root LFS attributes with the original patterns re-rooted relative to the extracted workspace. Install the private clone's own LFS hooks. Preserve/reconcile approved local changes separately; never silently commit the primary checkout. Verify materialized binaries against pointer IDs and plugin dependency locks.

After explicit push approval, upload the required historical LFS objects and push only the selected import branch to the verified private remote. The maintainer initializes main and its default-branch setting. Independently clone from that remote, download its LFS objects without borrowing the local cache, verify all historical hashes, materialize current files and require clean status. Do not detach the stable checkout before this independent recovery test passes.

### 3. Detach through the core PR

The PR removes workspace paths from the core index, ignores `.xrbuild/` as a whole, retires workspace-push/LFS-only hooks and private CI jobs, and retains generic launchers and tests. Generic dependency verification accepts an explicit `--workspace=<path>` rather than assuming a private checkout exists. Private integration assertions move to private tests, not silent skips.

Private CI owns asset checks and runtime build/verification. It checks out an independently selected core revision and uses `XRB_CORE`. While core is private, configure a read-only core credential **only in private CI**; once public, private access is unnecessary. Review the private workflow and its migrated tests separately. Core CI must not require private source, assets or credentials. A documented workflow or successful local test is not evidence that remote Windows CI ran.

The maintainer merges the core PR. Before updating the stable checkout, re-inventory local changes and back up the entire current workspace outside that checkout and any disposable worktree. **The old core index still tracks the workspace: checking out or pulling across the removal commit can delete its tracked files.** A path being ignored in the new commit does not protect files tracked by the old commit.

Only the maintainer performs the stable checkout update. Resolve intentional local setting discards explicitly, retain backups, then fast-forward main to the merged commit. Once the core index has no `.xrbuild` entries, preserve any leftover local-only workspace folder separately and provision the independent private clone at the now-free `.xrbuild/` path. Restore only the approved local-only files/settings from the recovery copy, without overwriting the private clone's `.git`, attributes, tracked source or intentionally retained configuration. Avoid unchecked metadata-only conversion or moving a `.git` into the old folder: attributes, index and LFS state must match.

Verify clean status in both repositories, core ignore behavior for nested files/metadata, pinned binary hashes and explicit repository launchers. Keep the recovery copy until the combined development flow is proven usable. Do not update or remove another task's worktree as part of cutover.

### 4. Prepare an isolated core export

Use a disposable complete clone with no push remote, LFS smudging disabled, and an explicit allowlist of branch/tag refs to publish. Never filter the stable checkout or original private archive. Check all refs, including tags and merges; rewriting main alone is insufficient if another published ref retains private files.

With built-in tools, an index filter removing `.xrbuild/` recursively, pruning empty commits and rewriting approved tags is acceptable in the isolated copy. Preserve source snapshots before filtering. Backup refs/reflogs produced by filtering are private recovery material, never publication refs. Any pruning or deletion is separately approved and limited to the disposable copy. Do not use `push --mirror`, an unqualified all-branches push, or upload private LFS objects to the new core repository.

Run `tools/public-history/audit.mjs` from the reviewed core checkout against the disposable export, passing its absolute path followed by every intended `refs/heads/...` and `refs/tags/...`. The audit resolves immutable IDs, checks the complete reachable object closure (including merged histories and annotated tag messages), examines full commit trees, and rejects private workspace paths/gitlinks, LFS pointers and known prohibited names. Reports use object IDs rather than private contents. It reads data only: it never changes refs or hosting state. Missing objects, shallow/partial/grafted/replaced history, unsupported path encodings and resource limits fail closed. Default limits are 16 MiB per object and 256 MiB of batched contents; a limit error is not a clean result.

The audit is a necessary mechanical gate, not proof that unknown confidential material or credentials are absent. Independently review all remaining public contents/messages, dependencies and rights. It does not promise erasure from a previously hosted repository. Clone only the approved refs into another fresh repository and repeat verification there. Record exact IDs and ensure the destination contains no extra refs, releases, caches or artifacts from the private archive. Never merge old unfiltered branches into the rewritten public lineage.

### 5. New hosting repository, still private

After explicit approval, rename the original hosting repository to a private archive and keep its old refs, PRs and private LFS storage private. Create a genuinely new core repository, initially private, and push only the approved audited refs. Force-pushing the old repository is not a substitute: hosting can retain PR-reachable commits, cached objects and LFS assets.

Reconfigure the bot installation, repository variables/secrets, labels, merge settings and required checks on the new repository. Use the correct `xrbuild` governance target and retain its explicit apply confirmation; never apply core governance to the private workspace or archive. Existing PR-number references in rewritten commit messages belong to the archive, not the new repository's numbering. Verify fresh-clone contents and CI/bot behavior before any visibility change. Keep old local worktrees and backup remotes isolated from the new public destination.

### 6. Public release is separate

Resolve licensing, copyright authority, third-party notices and confidential-material review. Only then obtain explicit approval to make the clean new repository public and apply the public ruleset. Keep the archive and workspace private. Re-clone the rewritten core rather than casually switching an old unfiltered checkout across unrelated histories; restore a separately verified private workspace clone at the ignored path. Never copy old private refs into the new repository.

## Recovery

If extraction, hash checks, private upload or independent clone verification fails, stop before detachment and use the intact primary checkout plus private snapshot. If stable cutover fails, restore into a new private recovery directory first, including Git and LFS objects, then compare saved local files and recorded links before replacing any working folder. If export auditing fails, retain the private archive and repair only the disposable export. If hosting setup fails, leave visibility private and preserve both repositories until the maintainer resolves the mismatch. No failed migration justifies deleting source history, bypassing an audit, or publishing to test whether it worked.
