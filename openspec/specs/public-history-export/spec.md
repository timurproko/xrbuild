# public-history-export Specification

## Purpose
Define read-only verification of explicitly selected publication history and the owner-controlled separation of export preparation, approval and remote migration. Passing an audit does not itself authorize publication, hosting changes or cleanup.

## Requirements

### Requirement: Isolated public history export
The public core SHALL be published to a fresh hosting repository from an audited parentless snapshot or audited filtered history. The original hosting repository SHALL remain private. Any history rewriting SHALL occur only in a disposable copy. Publication SHALL include only approved refs. Deleting current workspace files or force-pushing the existing hosting repository SHALL NOT constitute a safe export.

#### Scenario: Historical private file
- **WHEN** a private workspace file was deleted before the current core revision
- **THEN** the exported history contains that file in no commit reachable through approved publication refs, whether old history is omitted entirely or filtered

#### Scenario: Existing private hosting repository
- **WHEN** the maintainer prepares public hosting
- **THEN** the old repository remains private and the public destination is a fresh repository without the old pull-request refs or private LFS uploads

#### Scenario: Fresh initial commit
- **WHEN** the maintainer chooses to discard core history
- **THEN** the new core starts with one parentless commit containing only reviewed tracked core files, and no old Git metadata, private workspace files or LFS objects are copied into it

#### Scenario: Deferred automation setup
- **WHEN** the new repository is bootstrapped before workflow configuration
- **THEN** workflow definitions are preserved but Actions remains disabled until the maintainer separately approves setup and validation

### Requirement: Complete reachable-history verification
The export audit SHALL inspect all commits, trees and blobs reachable from explicitly selected publication refs, including merge commits and tags. It SHALL reject private workspace paths, private workspace LFS pointers and known prohibited names in public material, and SHALL fail closed when validation is incomplete. Passing the audit SHALL NOT replace manual confidential-material and license review.

#### Scenario: Merge-only private content
- **WHEN** a merge commit contains private workspace content absent from ordinary patch output
- **THEN** the audit reports failure based on that commit's tree

#### Scenario: Additional publication ref
- **WHEN** a selected tag or branch retains private content although the selected main branch is clean
- **THEN** the complete export fails validation

#### Scenario: Relocated pointer
- **WHEN** a private workspace LFS pointer remains outside the removed subtree
- **THEN** the export fails validation without uploading its referenced object

#### Scenario: Missing history
- **WHEN** a selected ref or a reachable object cannot be read
- **THEN** the audit fails rather than treating the missing data as clean

### Requirement: Staged owner-controlled migration
The migration procedure SHALL preserve recoverable source history, local changes and referenced private LFS objects before detachment. Remote pushes, file deletion, archive rename, repository creation and public visibility changes SHALL require explicit maintainer approval. Agents SHALL NOT push main or merge the detachment PR. The audit itself SHALL be read-only.

#### Scenario: Dirty primary workspace
- **WHEN** the primary checkout has uncommitted workspace changes
- **THEN** extraction waits for an approved preservation decision rather than dropping or silently committing them

#### Scenario: Pre-publication gate
- **WHEN** confidential-material review of the snapshot is incomplete, including when the maintainer has already created an empty public destination
- **THEN** no source is uploaded until the snapshot review and explicit push approval are complete; deferred licensing is not represented as a license grant
