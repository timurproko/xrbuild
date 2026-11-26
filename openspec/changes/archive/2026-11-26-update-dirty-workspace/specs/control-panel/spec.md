# Spec Delta

## MODIFIED Requirements

### Requirement: Update a Git workspace

The control panel SHALL freshly discover and fetch origin's default branch, download required LFS content before checkout, and fast-forward only to the fetched commit while preserving local work. Dirty state alone SHALL NOT prevent Update. Detached, local-ahead, diverged and unsuitable-upstream checkouts SHALL remain refused. Update SHALL never stash, reset, force, rebase or create merge commits. Rebuild SHALL remain independent of Git advancement.

#### Scenario: Workspace behind its upstream

- **WHEN** the workspace is on origin's default branch with no local-only commits and the person runs Update
- **THEN** the panel freshly fetches that branch, downloads the required LFS content, safely fast-forwards and reports the old and new commits and completed follow-up

#### Scenario: Remote moves during the update

- **WHEN** the default branch gets another commit after the panel fetched and before it fast-forwards
- **THEN** the workspace ends at the captured fetched commit without a second fetch, and the next Update can bring the newer commit

#### Scenario: Already up to date

- **WHEN** a fresh successful fetch proves HEAD equals the remote default branch and no preparation or rebuild is unfinished
- **THEN** the panel succeeds and reports already up to date regardless of modified, staged, deleted or untracked local files, without unnecessary LFS downloads or native builds

#### Scenario: Ordinary panel-written workspace state

- **WHEN** local state contains modified pnpm-lock.yaml and xrb-plugins.json, and untracked projects/.gitkeep and projects/Unsorted/, and the remote matches HEAD or advances unrelated source paths
- **THEN** Update succeeds, preserves that local state and every project, and completes any required safe follow-up

#### Scenario: Non-conflicting local changes

- **WHEN** the repository has an uncommitted or staged source edit or an untracked source file that Git can preserve during the incoming fast-forward
- **THEN** Update advances to the fetched commit without changing that edit, its staging or the untracked file

#### Scenario: Conflicting local changes

- **WHEN** incoming source changes conflict with a locally modified or staged tracked source file, or would overwrite an untracked source file outside protected user data
- **THEN** Update refuses that repository, preserves its HEAD, index and files, and names the first few blocking files in one actionable sentence

#### Scenario: Diverged branch

- **WHEN** the workspace has local-only commits and the remote default branch has new commits
- **THEN** Update refuses before checkout and asks the person to reconcile the branch by hand before retrying

#### Scenario: Local-ahead branch

- **WHEN** the workspace has commits absent from the freshly fetched remote default branch but no remote commits are missing locally
- **THEN** Update refuses with an actionable local-commits explanation and does not claim already up to date

#### Scenario: Detached checkout

- **WHEN** the workspace has a detached HEAD
- **THEN** Update leaves it untouched and asks the person to switch safely to the remote default branch before retrying

#### Scenario: Removed or unsuitable upstream

- **WHEN** the workspace tracks a deleted upstream, another branch or another remote instead of origin's current default branch
- **THEN** Update leaves HEAD and local branch configuration unchanged, reports the branch problem and names the advertised default branch to switch to safely

#### Scenario: Remote unreachable

- **WHEN** remote discovery or fetching fails
- **THEN** Update reports that this repository was not updated, gives a recovery instruction and does not use cached references as proof of currentness

#### Scenario: LFS content fails to download

- **WHEN** downloading required incoming LFS content fails
- **THEN** Update leaves HEAD unchanged, does not rebuild that repository and asks the person to retry the download

#### Scenario: Local LFS deletions and fetch exclusions

- **WHEN** an incoming source change conflicts with a locally deleted LFS source file
- **THEN** Update refuses that source collision and preserves the deletion, while an unrelated deletion alone does not block Update
- **WHEN** a clone excludes some LFS files from fetching
- **THEN** Update honors those exclusions and leaves excluded content as pointers

#### Scenario: Running Update again finishes an unfinished update

- **WHEN** an earlier Update advanced the workspace but its preparation or rebuild failed
- **THEN** the next Update retries only unfinished work despite an unchanged commit and reports the commits already advanced

#### Scenario: Status leaves the Git index alone

- **WHEN** the panel reads repository status for the menu or behind hint
- **THEN** it takes no Git lock, does not rewrite the index and runs no Git beside an active Update

#### Scenario: Behind hint without fetching

- **WHEN** the last fetch found new commits that the workspace does not have
- **THEN** the panel qualifies the behind hint with that repository's last check time, never fetches on its own and does not describe local changes alone as blocking Update

#### Scenario: Workspace cannot be updated

- **WHEN** the workspace is not an independent clone, lacks a suitable upstream or lacks required Git LFS for incoming content
- **THEN** its reason is shown without preventing Update from attempting an eligible core checkout

### Requirement: Update reports the core checkout

The control panel SHALL independently update the running core checkout and selected workspace to freshly fetched origin default-branch commits, report each outcome and update an identical repository only once. A refusal SHALL NOT prevent the other repository's attempt or independent follow-up. The overall job SHALL fail when either repository needs attention without hiding partial success.

#### Scenario: One Update action for both repositories

- **WHEN** the person opens the panel menu and points at Update
- **THEN** its name is exactly Update and the tooltip describes both repositories with separately qualified check times, without a workspace-only or read-only-core claim

#### Scenario: Core status

- **WHEN** the core is packaged without Git, detached or missing a suitable upstream
- **THEN** the panel reports the specific limitation and recovery action and still attempts the workspace; core without LFS-tracked content does not require Git LFS

#### Scenario: Core behind while only its status is reported

- **WHEN** the core is behind as of its last fetch and the person reads status without starting Update
- **THEN** the panel reports the cached behind state and its check time without claiming that core was freshly checked or updated

#### Scenario: Core behind with a stale remote reference

- **WHEN** core HEAD and cached origin default-branch reference match but the remote has advanced
- **THEN** Update freshly fetches and advances the core, reports its before/after commits and does not derive success from the old reference

#### Scenario: Workspace is the core checkout

- **WHEN** the selected workspace resolves to the same checkout as the core
- **THEN** Update fetches, checks and fast-forwards it once, and reports that both roles refer to that repository

#### Scenario: Core failure and workspace success

- **WHEN** the core has a conflicting source edit, detached HEAD, local-only history, an unsuitable upstream or cannot fetch, but the workspace can update
- **THEN** the workspace still updates and the job fails with actual workspace success and one actionable core failure sentence

#### Scenario: Workspace failure and core success

- **WHEN** the workspace cannot update but the core can
- **THEN** the core still updates and its independent dependency preparation, bundled-component preparation and required core builds run; only source-dependent workspace or cross-repository work is deferred and named

### Requirement: Update completes setup and reports activation requirements

Update SHALL prepare changed public core dependencies through the pinned frozen hook-disabled setup, prepare required changed bundled services and rebuild required native output. Each follow-up SHALL depend only on sources it actually consumes. Failures SHALL preserve fetched commits and retain only unfinished work for retry. Results SHALL distinguish disk changes from loaded code and state pending work and required restart; Update SHALL NOT silently restart.

#### Scenario: Public core dependencies changed

- **WHEN** an accepted core fast-forward changes required public app dependency inputs
- **THEN** Update runs the pinned frozen-lockfile install with lifecycle hooks disabled, streams its output and reports failure if dependencies cannot be prepared, even if workspace source update was refused

#### Scenario: Native rebuild required

- **WHEN** either repository advanced or has unfinished build work
- **THEN** Update rebuilds safe native plugins and the host when missing or outdated, without automatically installing native prerequisites or private JS packages; work requiring a refused source alone is deferred and named

#### Scenario: Panel activation

- **WHEN** core code or loaded workspace plugin code changed during Update
- **THEN** the result preserves the Restart requirement even after partial failure and offers the existing in-place Restart control without automatically restarting

#### Scenario: Post-pull failure

- **WHEN** preparation or rebuild fails after one or both repositories advanced
- **THEN** Update reports the actual before/after commits, fails rather than claiming completion and retains resumable unfinished work without rerunning completed independent work unnecessarily

#### Scenario: Public service inputs changed

- **WHEN** Update pulls changed embedded service inputs
- **THEN** it prepares current public services before reporting that preparation complete, and names any remaining preparation or activation needed

#### Scenario: Retry at an unchanged commit

- **WHEN** service preparation failed after a successful pull and Update is retried at the same commit
- **THEN** it retries unfinished preparation and reports actual readiness instead of falsely claiming completion

## ADDED Requirements

### Requirement: Update preserves workspace user data

Update SHALL leave workspace plugin settings, panel layout/settings and user projects exactly local, whether tracked or untracked and even when upstream changes those paths. Such data SHALL NOT block advancement. A locally present panel-generated workspace lock SHALL also be preserved, not silently regenerated. Skipped incoming defaults SHALL be identified with a way to inspect and explicitly adopt them; source-repository dependency locks remain source inputs.

#### Scenario: Upstream plugin or panel settings changed

- **WHEN** upstream changes xrb-plugins.json or xrb-panel.json while local settings exist or were deliberately removed
- **THEN** Update succeeds, preserves the local version or deletion without preference merging, and reports in one line that upstream defaults were not applied and can be inspected from the fetched revision before explicit adoption

#### Scenario: Incoming project path collision

- **WHEN** an incoming commit adds, edits or removes paths under the selected workspace's user-project tree, including paths occupied by untracked projects
- **THEN** Update preserves existing local project contents and deliberate deletions, advances safe source paths and never asks the person to commit or move their projects to unblock Update

#### Scenario: Incoming workspace lock changed

- **WHEN** incoming pnpm-lock.yaml differs from the locally present workspace lock generated during ordinary use
- **THEN** Update preserves that lock, succeeds with an upstream-lock-skipped notice and provides inspection/adoption guidance without regenerating dependencies or changing projects

#### Scenario: Fresh workspace template

- **WHEN** a person initializes a workspace from the core template
- **THEN** installation-local plugin and panel settings and their transient write files are ignored by Git, while authored project sources and curated dependency locks are not indiscriminately hidden

### Requirement: Update results are concise and detailed output is not repeated

A completed Update dialog SHALL show an overall outcome title, one short line per repository with seven-character before/after commits or already up to date and a refusal reason if any, and at most one next-action line. It SHALL expose Restart when required. Full revisions and step details SHALL remain in job output, with one terminal summary rather than copies appended by failure handling.

#### Scenario: Complete success

- **WHEN** all repository updates and required follow-up succeed
- **THEN** the title says Updated, or Updated, restart needed when applicable, and the compact repository lines omit full hashes and command output

#### Scenario: Partial success

- **WHEN** core updated but a genuine workspace source conflict remains
- **THEN** the title says Core updated; workspace needs attention, names the conflicting paths on the workspace line and combines remaining recovery/restart guidance into at most one next-action line

#### Scenario: Local defaults retained

- **WHEN** upstream settings or a generated workspace lock were skipped to preserve local user data
- **THEN** the workspace line concisely names the skipped defaults, and at most one next-action line explains inspection/adoption together with any restart or deferred work

#### Scenario: Job and CLI failure output

- **WHEN** an Update fails through the panel job runner or terminal command
- **THEN** output contains one full per-repository revision record and one terminal result, with a short failure envelope instead of replaying the summary or restart sentence multiple times
