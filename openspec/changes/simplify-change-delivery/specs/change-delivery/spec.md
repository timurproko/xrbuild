## MODIFIED Requirements

### Requirement: Delivery skill

The repository SHALL own delivery in `.claude/skills/change-delivery/SKILL.md`, with repository-owned root instructions and project context routing to it. Guidance SHALL distinguish planning, implementation, publication, acceptance, integration and removal authority without duplicating repository procedures or modifying or overriding OpenSpec skills, generated commands or framework semantics. A PR-delivery request SHALL include scoped commits/pushes; edit-only and planning-only SHALL not imply broader operations. Repository guidance SHALL describe trusted delivered-change finalization through supported integration points while leaving generic OpenSpec sync/archive skills unchanged; conflicts requiring framework changes SHALL be reported as separately scoped blockers. Private export, remote deletion and hosting mutation retain explicit permission.

#### Scenario: Agent starts a task
- **WHEN** an agent is asked to deliver a change in the core
- **THEN** it loads the skill and follows it without further instructions on branch, worktree or PR handling

### Requirement: One task, one worktree, branch and PR

Repository, branch, history, change and PR SHALL identify a task across directories/machines. Planning and remote administration SHALL require no checkout/setup/sweep. Implementation SHALL use an owned isolated checkout with primary on main. Entry SHALL support verified remote proposals or unoccupied local branches without resetting history, preserve dirty owned edits and separate dependency setup. Divergence, collisions or live/unverifiable ownership SHALL fail non-destructively. Agents SHALL neither edit another task nor falsely claim runtime cwd mutation.

#### Scenario: Two agents in parallel
- **WHEN** two agents work on two tasks at the same time
- **THEN** each works in its own worktree and branch, and neither changes the other's files or the primary checkout

#### Scenario: Failed worktree setup
- **WHEN** entry or necessary dependency setup fails
- **THEN** implementation SHALL not fall back to primary
- **AND** remote-only planning MAY continue without setup

#### Scenario: Continue on another machine
- **WHEN** an existing proposal branch is selected for implementation
- **THEN** entry SHALL verify repository/ref/head and retain its ancestry and PR rather than start again from main

#### Scenario: Owned dirty resume
- **WHEN** the matching checkout contains the task owner's edits
- **THEN** resume SHALL preserve them without reset or blanket clean-tree rejection

### Requirement: Plan before code

A new OpenSpec delivery PR SHALL begin as a real planning-only draft with unchecked outcomes, using explicit repository/base/head and selected change artifacts. Publication SHALL need no checkout and SHALL handle concurrency/retries without force or silent ref deletion. Implementation SHALL require approved scope and an explicit request, continuing the same branch/history/change/PR in an owned checkout that MAY be created later or elsewhere. A clear request MAY approve scope and request implementation without another mandatory turn. Material refinements require approval before affected code; wording-only clarification does not.

#### Scenario: Plan awaiting approval
- **WHEN** the agent has pushed the plan and the maintainer has not answered
- **THEN** the draft PR holds no implementation and the agent has handed off

#### Scenario: Request mixing plan and implementation
- **WHEN** a clear request approves the intended scope and asks for implementation
- **THEN** the agent MAY proceed after presenting its plan without a ritual approval turn
- **AND** unresolved material scope SHALL still be clarified rather than self-approved

#### Scenario: Remote-only planning
- **WHEN** a draft is requested from outside a checkout
- **THEN** explicit GitHub CLI/API identity and in-memory/session scratch SHALL suffice
- **AND** only planning artifacts SHALL be published without setup/sweep or implementation

#### Scenario: Publication retries
- **WHEN** publication finds an existing branch/PR or a changed expected head
- **THEN** it SHALL report/reconcile the same task without overwriting concurrent work or deleting remote refs

### Requirement: PR body contract

New linked drafts SHALL contain a concise Proposal, one or more meaningful initially unchecked Implementation outcomes and final collapsed Automation with valid linkage. Completion SHALL add one or more plain Acceptance outcomes and complete required implementation. Arbitrary sentence/byte/item limits and ordinary test/coverage/link wording SHALL not be readiness gates. Unambiguous structure, valid association and substantive completion remain required. One parser/validator SHALL own linkage and shared inspection. Legacy ready version-1 bullets remain supported.

#### Scenario: Linked PR
- **WHEN** a PR body holds a valid fence naming an active change
- **THEN** CI and trusted finalization treat the PR as delivering that change

#### Scenario: Malformed link
- **WHEN** the fence holds invalid JSON, an unknown version or a change id that is not a valid folder name
- **THEN** the delivery check fails with a message naming the problem

#### Scenario: Draft progress
- **WHEN** local outcome work is complete
- **THEN** local tasks SHALL be updated promptly and the PR item when that work is published
- **AND** this SHALL not mark ready or claim acceptance

#### Scenario: Detailed implementation checklist
- **WHEN** a completed linked draft has more than five valid checked Implementation outcomes
- **THEN** trusted promotion accepts the checklist rather than blocking solely because it exceeds the recommended count

#### Scenario: Single-outcome fix
- **WHEN** one meaningful outcome fully describes the change
- **THEN** readiness SHALL not invent a second item or reject legitimate testing vocabulary

### Requirement: Finalization in the PR
Trusted automation SHALL promote only an unheld linked draft with complete exact-head tasks, checked Implementation and valid Acceptance. Delivery hold SHALL pause promotion and finalization; release SHALL trigger fresh bounded reconciliation. It SHALL recheck identity, body, base, head and hold state before promotion; unfinished drafts remain draft and invalid completed drafts report blockers. The App SHALL finalize a ready linked PR in its branch by archiving the change, syncing and validating specs, pushing, and recording its link. Existing ready PRs retain the old path.

#### Scenario: Marked ready
- **WHEN** a linked PR with all tasks done is ready
- **THEN** a finalization commit by the App appears on the branch, the change folder is under `archive/`, the canonical specs include its deltas, and CI runs on the new head

#### Scenario: Completed draft
- **WHEN** a linked same-repository draft satisfies all readiness conditions without hold at one unchanged head
- **THEN** the App marks it ready, the finalizer archives its change on that branch, and full CI runs on the finalized head

#### Scenario: Open tasks
- **WHEN** a linked ready PR's `tasks.md` contains unchecked tasks
- **THEN** no finalization commit is made and the run lists the open tasks

#### Scenario: Incomplete draft
- **WHEN** the exact head's `tasks.md` contains unchecked tasks
- **THEN** the draft remains draft and no finalization commit is made

#### Scenario: Stale snapshot
- **WHEN** the head or body changes while promotion is being validated
- **THEN** that run does not promote the changed candidate

#### Scenario: Already finalized
- **WHEN** a finalized PR gets another commit that does not bring the active change folder back
- **THEN** finalization makes no new commit

#### Scenario: Paused complete candidate
- **WHEN** delivery-hold is present despite complete tasks
- **THEN** automation SHALL leave promotion/finalization paused

#### Scenario: Resume a finalized draft
- **WHEN** an archived PR returned to draft is explicitly released from hold
- **THEN** automation SHALL validate its current archive/history/tasks/body/target and MAY re-promote the exact complete snapshot
- **AND** it SHALL not require restoring an active folder or infer merge permission

### Requirement: Maintainer merges

The maintainer SHALL decide integration. Agents MAY execute a fresh direct request identifying the exact repository/PR/head/base through one protected squash merge, after re-reading hold, finalization, required checks and applicable acceptance. The request SHALL bind expected head and fail closed for stale/pending/conflicting/ambiguous evidence without bypass or direct main push. Implementation/CI completion SHALL not imply integration. Agents and bots SHALL NOT independently choose linked-PR merge, arm its auto-merge or promise deferred merge. Personally armed integration SHALL retain exact-candidate evidence and become stale on relevant identity/acceptance changes; native arming alone is not acceptance. Current non-strict protection SHALL not gain an implicit strict-base requirement.

#### Scenario: Validated linked PR
- **WHEN** a finalized linked PR is green without fresh explicit merge authorization
- **THEN** it SHALL remain open for the maintainer

#### Scenario: Explicit one-shot merge
- **WHEN** the maintainer requests the verified exact candidate and all protection/acceptance gates pass
- **THEN** the agent MAY execute protected expected-head squash merge once

#### Scenario: Candidate changes
- **WHEN** head/base/body/acceptance invalidates the authorized snapshot
- **THEN** the old authority SHALL not carry forward automatically
- **AND** automation SHALL neither manufacture approval nor blindly cancel unrelated human arms

### Requirement: Documentation auto-merge

Documentation auto-merge SHALL operate only under a separately reviewed enabled profile. When enabled it MAY arm protected App squash auto-merge for unheld ready same-repo main PRs with routine docs-only changes, no active/linked delivery and no opt-out. Complete diffs including rename sources/destinations SHALL be checked. Agent instructions, governance/cleanup authority and privileged-policy docs SHALL be excluded even under Markdown/docs paths. Bot-owned arms SHALL be withdrawn when eligibility disappears; human arms SHALL not be blindly modified. Repository allow-auto-merge alone SHALL not promise a running controller. This change SHALL not activate dormant workflows.

#### Scenario: Docs fix
- **WHEN** the controller is explicitly enabled and a ready unheld PR changes only routine README prose
- **THEN** it MAY auto-merge after CI required passes, producing main CI
- **AND** the disabled profile SHALL make no such promise

#### Scenario: Plan only
- **WHEN** a PR adds only an active change folder
- **THEN** it is not auto-merged

#### Scenario: Authority-changing Markdown
- **WHEN** AGENTS or policy documentation changes delivery/cleanup/privileged authority
- **THEN** the PR SHALL remain outside routine automatic integration

#### Scenario: Explicit opt-out
- **WHEN** no-auto-merge or delivery-hold applies
- **THEN** automation SHALL not arm or exercise documentation integration

### Requirement: Unarchived change report

When separately reviewed and enabled, the reconcile workflow SHALL maintain one openspec-reconcile issue for active changes linked by merged PRs and close it when empty. Disabled activation SHALL remain explicit and SHALL not imply reports are produced. Delivery simplification SHALL not activate it.

#### Scenario: Merged without archive
- **WHEN** the reconcile workflow is enabled and a merged PR leaves its linked change active
- **THEN** the next enabled run SHALL list it in the issue
- **AND** disabled source presence SHALL not be reported as observed reconciliation

### Requirement: Agent scratch folder

Implementation scratch SHALL remain ignored and non-authoritative in the owning checkout artifacts, never another checkout. No-checkout planning/administration SHALL permit stdin, memory or isolated secret-free session scratch without a worktree. Durable evidence SHALL not be scratch-only. Neither route SHALL persist credentials or private content publicly.

#### Scenario: PR body
- **WHEN** a PR body is prepared remotely without a checkout
- **THEN** stdin, memory or isolated session scratch SHALL be allowed
- **AND** implementation-owned body files SHALL continue using that checkout artifacts

### Requirement: Worktree sweep and handoff

Portable handoff SHALL name repository/branch/change/PR, observed local/remote heads, verified publication, remaining work and optional path. Clean status/detach/release SHALL not prove push; remote-only handoff SHALL need no local registration. Existing local handoff remains compatible. Sweeps SHALL be explicit bulk operations, not planning/session prerequisites or exact runtime-completion substitutes. Automatic merged cleanup SHALL require fresh identity, no unpublished work, content preservation and ownership safety. Local-only published removal and abandonment SHALL remain separate authorizations. No force/recursive fallback SHALL delete unknown data.

#### Scenario: After a merge
- **WHEN** an explicitly scoped sweep finds a merged candidate satisfying publication/content/ownership safety
- **THEN** it MAY remove only eligible resources within that sweep scope
- **AND** exact completion SHALL not run this bulk sweep

#### Scenario: Uncommitted work
- **WHEN** a worktree has uncommitted changes
- **THEN** sweep reports it as `dirty` and never removes it

#### Scenario: Clean but unpublished handoff
- **WHEN** local commits remain absent from the intended remote
- **THEN** handoff SHALL disclose local-only work and removal SHALL retain it

### Requirement: Agent session worktree context

Before implementation edits, agents SHALL create or resume an owned isolated checkout and bind local operations to its canonical root. A1 enter/attach success SHALL be authoritative without a second inventory ritual. External agents SHALL use ordinary Git without installing A1. Planning/administration SHALL require no attachment. Resume MAY preserve dirty owned content; stale/foreign/busy/mismatched context SHALL block edits without reset or primary fallback. Attachment SHALL not grant cleanup, export or merge authority.

#### Scenario: New task from primary checkout
- **WHEN** implementation is requested from primary
- **THEN** the agent SHALL create/adopt an isolated branch checkout and establish its context while primary stays unchanged

#### Scenario: Draft PR appears
- **WHEN** a planning-only draft is published remotely
- **THEN** its repository/branch/change/PR SHALL identify the task without requiring a local checkout
- **AND** an already attached owned implementation checkout MAY remain attached

#### Scenario: Resume or switch tasks
- **WHEN** implementation resumes or switches
- **THEN** the intended context SHALL be established authoritatively with preserved edits
- **AND** stale/busy/mismatched state SHALL not be presented as current

#### Scenario: Link cannot be established
- **WHEN** required runtime attachment fails or ownership/identity is invalid
- **THEN** the agent SHALL report the blocker without editing primary or unrelated work
- **AND** supported standalone agents SHALL not be forced to install a runtime

### Requirement: Implementation progress while implementing

AGENTS.md SHALL contain the exact R17 routing paragraph to the shared `docs/delivery-rules.md` contract; other repository-owned instructions SHALL link rather than duplicate its R05 progress policy. Tasks SHALL map meaningfully to outcomes without mandatory one-to-one groups or per-outcome pushes. Agents SHALL record local progress promptly, publish coherent checkpoints and synchronize PR completion only to published work, including before handoff. A PR-delivery request includes scoped commits/pushes; edit-only remains local. Required implementation, observed tests/CI and optional device acceptance remain separate.

#### Scenario: Several outcomes
- **WHEN** a plan contains several outcomes
- **THEN** the agent MAY work across them and publish coherent groups without network barriers
- **AND** local versus published completion SHALL remain explicit

#### Scenario: Outcome awaits only CI or a device
- **WHEN** an outcome's code and tests are written and pushed but CI or manual device acceptance has not run
- **THEN** the agent ticks the outcome without waiting and reports the unobserved part as a gap

#### Scenario: Defect after a tick
- **WHEN** a ticked outcome later needs a fix
- **THEN** the fix is a new commit in the same PR

#### Scenario: Any agent runtime
- **WHEN** an agent loads the repository's instructions through `AGENTS.md` or `.claude/CLAUDE.md`
- **THEN** it receives the same exact shared contract through the R17 routing paragraph

#### Scenario: Plan tasks
- **WHEN** an agent writes a linked change's `tasks.md`
- **THEN** it has no task for ticking PR outcomes or handing off

#### Scenario: Single owner
- **WHEN** `.claude/CLAUDE.md`, the delivery skill or the PR template mention implementation progress
- **THEN** they refer to the `AGENTS.md` paragraph and do not restate it

## ADDED Requirements

### Requirement: Both repositories implement one exact delivery contract

Delivery simplification SHALL use the byte-identical `portable-delivery-v1` rulebook, adapter table, verification cases and digest manifest supplied by this change. Implementers SHALL copy them unchanged to the R17 destinations and use only the listed repository-specific bindings. They SHALL NOT paraphrase shared policy, change expected cases, invent exceptions or override OpenSpec.

#### Scenario: Agent installs repository guidance
- **WHEN** the approved delivery implementation installs guidance
- **THEN** the four contract files SHALL match the approved planning bytes and SHA-256 digests
- **AND** `AGENTS.md` SHALL contain the exact R17 routing paragraph once while other repository-owned entries link rather than restate policy

#### Scenario: Existing implementation predates the contract
- **WHEN** work has already started under an earlier plan
- **THEN** the agent SHALL preserve it and record the inspected head, rule/case reconciliation, corrections and blockers before further affected implementation
- **AND** unrelated completed tasks SHALL remain truthful without automatically discarding work

#### Scenario: Shared verification is executed
- **WHEN** either repository verifies implementation conformance
- **THEN** its test bindings SHALL consume every identical case and assert actual behavior against the unchanged expected results
- **AND** dropped cases, changed contract bytes, adapter drift or framework overrides SHALL fail verification rather than be silently accepted

#### Scenario: Implementer encounters ambiguity
- **WHEN** a requirement conflicts with the exact contract or a policy decision is unspecified
- **THEN** the affected action SHALL stop for explicit clarification without inventing an exception
- **AND** a contract refinement SHALL require matching approved updates in both repositories before affected implementation

### Requirement: Workflow simplification preserves the OpenSpec framework

Workflow simplification SHALL change only repository-owned delivery tooling, guidance and project-specific change artifacts. OpenSpec skills, commands and framework assets/semantics SHALL remain unchanged, without regeneration or indirect overrides. Framework-dependent outcomes SHALL be blocked pending separate explicit approval.

#### Scenario: Repository delivery guidance is simplified
- **WHEN** this change simplifies root instructions, the repository-owned delivery skill, runbooks or project context
- **THEN** the changes SHALL use supported integration points without changing or overriding OpenSpec skills or framework behavior
- **AND** project-specific proposals, designs, tasks and specification deltas SHALL remain distinct from protected OpenSpec skills (including `openspec-*`), generated OpenSpec/`opsx` commands, framework implementation, schemas, templates and lifecycle semantics

#### Scenario: Implementation diff is reviewed
- **WHEN** the implementation candidate is reviewed
- **THEN** the complete diff, including additions, deletions and rename sources/destinations, SHALL leave protected OpenSpec skills, commands and framework assets unchanged
- **AND** repository guidance SHALL be inspected for indirect overrides, not only changes to protected paths

#### Scenario: Simplification would require a framework change
- **WHEN** a proposed outcome cannot be delivered without changing or overriding OpenSpec
- **THEN** the agent SHALL report that outcome as blocked and seek a separate explicitly approved scope
- **AND** it SHALL NOT bundle the framework change into this delivery

### Requirement: Explicit published local removal preserves remote work

Explicit local removal SHALL target one named owned non-primary checkout with fresh remote containment proof, bounded preservation checks and non-force deletion. Remote work and local refs SHALL remain by default. Unavailable evidence or unsafe/unpublished content SHALL block deletion; local disposal SHALL grant no remote or private-data deletion authority.

#### Scenario: Published open PR
- **WHEN** the requested checkout is safely published and preservation checks pass
- **THEN** local-only removal SHALL proceed without waiting for merge/CI
- **AND** remote work and local topic ref SHALL remain
- **AND** open/draft PRs, pending CI, unfinished scope and missing acceptance/archive SHALL not block this route

#### Scenario: Remote advanced on another machine
- **WHEN** the remote tip contains local HEAD
- **THEN** different tip identity alone SHALL not block verified publication

#### Scenario: Clean outer Git hides valuable data
- **WHEN** ignored/private/nested/KEEP content exists
- **THEN** removal SHALL retain it despite clean status
- **AND** dirty/untracked/unknown-ignored/private/nested/submodule/KEEP data, unsafe links and live/unverifiable claims SHALL block removal
- **AND** scoped locks and exact identity rechecks SHALL protect bounded content inspection and non-force deletion without recursive force fallback
- **AND** disposable caches SHALL be explicitly bounded, not inferred from ignore rules; deleting refs/private data requires separate explicit scope

#### Scenario: Publication cannot be proved
- **WHEN** local commits are unpushed/divergent or remote evidence is unavailable
- **THEN** removal SHALL retain the checkout and report the blocker

### Requirement: Runtime cleanup targets only the attached task

Runtime completion/local-removal SHALL use exact-target operations, never sweep or force fallbacks. A compatible released A1 interface SHALL preflight before detach and settle outside the checkout before deletion. Repository operations SHALL recheck identity/publication/claims, preserve blocked resources and retain standalone support.

#### Scenario: Another merged checkout exists
- **WHEN** one attached task is completed or explicitly removed locally
- **THEN** unrelated worktrees SHALL remain untouched
- **AND** retries SHALL not delete recreated identities or retained branches

#### Scenario: Post-detach race
- **WHEN** ownership or content changes before deletion
- **THEN** cleanup SHALL retain the target and report the blocker with the session usable outside it

#### Scenario: Runtime release unavailable
- **WHEN** the installed runtime lacks the required adapter
- **THEN** instructions SHALL report compatibility requirements and retain safe standalone operations without substituting a sweep
