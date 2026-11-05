# Tasks

These tasks cover the core PR and its tested migration procedure. Real remote migration and post-merge checks remain a separately approved follow-up; they are not marked complete by this PR.

## 1. Repository boundary

- [x] 1.1 Stop tracking the workspace in this task branch, ignore `.xrbuild/` as a whole, remove obsolete workspace attributes and direct-push tooling/hooks/package references; verify the branch index contains no workspace paths or gitlink and ordinary core hooks/tests still pass. Do not delete the primary workspace.
- [x] 1.2 Keep explicit repository launchers and default user-workspace behavior, and expose generic workspace verification with an explicit path; verify focused panel/workspace/dependency tests with an independent fixture workspace and without private checkout contents.

## 2. Worktree isolation and CI

- [x] 2.1 Share only core dependencies, document task-local private clone provisioning, and prevent worktree cleanup from discarding nested repository work; verify worktree tests cover no private links and refusal to remove a nested private clone without its separate preservation procedure.
- [x] 2.2 Remove private jobs, filters and required-job entries from core CI and document private CI relocation; verify workflow-selection tests and run the core Node suites without private workspace files.
- [x] 2.3 Correct the governance target-name check without weakening explicit apply confirmation; verify tests accept the intended repository and reject a different repository with no remote writes.

## 3. Export preparation

- [x] 3.1 Add a read-only reachable-history audit for explicit publication refs with fail-closed handling and neutral reports; verify fixtures detect deleted/merge-only private files, private refs, relocated LFS pointers and invalid refs, and accept a clean filtered export.
- [x] 3.2 Document backup, whole-subtree extraction, LFS preservation, isolated filtering, independent-clone validation, private-first hosting setup and rollback; verify a local fixture rehearsal preserves private history/LFS pointers while public refs contain no private file history and no production remote is modified.

## 4. Split documentation and validation

- [x] 4.1 Update active repository/workspace instructions, README, project-repository docs and OpenSpec context for independent versioning and confirmation gates; verify active instructions no longer require core tracking or direct main pushes for workspace files and explicitly defer licensing/notices to a pre-publication follow-up.
- [x] 4.2 Run focused tests, core regression suites, the name guard and strict OpenSpec validation; verify results are recorded with any native/device-only gaps explicitly identified and no remote migration or public release represented as completed.

## 5. Maintainer-selected fresh bootstrap

The maintainer chose a parentless initial commit instead of preserving core history. The old archive PR remains unmerged; hosted CI is not a prerequisite for preparing the local snapshot, and its failed runs are not treated as passes.

- [ ] 5.1 Prepare an isolated fresh repository from reviewed tracked core files plus an explicit migration-documentation overlay allowlist, retaining workflows; verify it has exactly one parentless commit, no old metadata/object alternates, no private paths/LFS pointers and an exactly matching intended tree.
- [ ] 5.2 Independently clone and audit that fresh commit, run core regression/name/spec checks without a private workspace, and record deferred automation setup; verify the clean snapshot remains local, Actions stays disabled and original private source/backup repositories remain intact.

## Deferred follow-up

The maintainer separately approves and performs the initial main push, followed by a fresh remote-clone audit and local checkout cutover. Restore bot/governance/CI configuration and pending OpenSpec synchronization through a test PR before ordinary task delivery resumes. Do not represent the old archive PR as merged or finalized. Licensing, commercial terms, copyright authority and dependency notices are deferred; no license grant is introduced. The archive and workspace stay private; the new empty public repository receives only the explicitly approved audited snapshot.
