## Context

Audit baseline: main at 7d0ea7ebb785c4cbfdc5671250daaae0f3e2d851. Read-only live inspection confirmed squash/linear integration, non-strict CI required and no bypass actors. Docs auto-merge, Nightly triage and OpenSpec reconcile are disabled_manually under the reviewed activation profile. Repository auto-merge being allowed is not evidence these controllers run.

Entry currently creates from origin/main and installs by default; owned dirty resume is rejected. The open-PR remove path retains the local branch but lacks remote containment proof and follows force-removal with recursive deletion. Its private workspace/KEEP checks must be strengthened, not removed. The runtime completion declaration invokes sweep --apply rather than one exact checkout. AGENTS progress mandates commit/push per outcome while .claude instructions say commit only when asked. Repository delivery guidance must distinguish its responsibilities from unchanged OpenSpec propose/sync/archive skills; framework requirements are not simplification targets. The canonical governance spec still describes an admin bypass absent from current declared/live settings.

## Goals / Non-Goals

Goals: shared observable behavior with the companion proposal; portable task identity; operation-scoped authority; protected private/unpublished data; clear readiness and activation; fewer repeated rules.

Non-goals: changes to or overrides of OpenSpec skills, generated commands or framework behavior; a new mandatory framework, equal package managers/branch names/metadata, distributed edit locks, activating dormant workflows, strictness changes, weaker checks, bot implementation merge, private exports, device-validation changes, historical task rewriting or testing destructive operations on actual user worktrees.

## Decisions

### OpenSpec remains unchanged

OpenSpec skills and the OpenSpec framework are out of scope. Do not modify, regenerate, replace, or override `openspec-*` skills, generated OpenSpec/`opsx` commands, framework implementation, schemas, templates, or lifecycle semantics. Simplify only repository-owned delivery tooling and guidance around the unchanged framework. Project-specific proposal, design, tasks and specification deltas remain editable; that does not authorize framework changes. If an outcome requires changing OpenSpec, report the blocker and move that work to a separate explicitly approved scope instead of bundling it here.

Repository-owned `change-delivery` guidance, root instructions, runbooks and project context may describe repository responsibilities and supported integration points, but must not shadow or override OpenSpec instructions. Existing framework requirements are not redundant repository rituals to remove. Review the complete implementation diff, including additions, deletions and rename sources/destinations, to verify protected OpenSpec assets remain unchanged; also inspect repository guidance for indirect overrides. Do not run skill regeneration as part of this change.

### Planning versus implementation

Analysis, remote administration and real planning-only publication need explicit repo/base/head, not a checkout or runtime. Support ordinary CLI/API and stdin; an optional helper publishes only the selected change folder, with create-only refs, expected-head writes, duplicate discovery and recoverable partial publication. Draft outcomes remain unchecked. No dummy diff or separate planning merge is required. In-memory/session scratch is allowed for no-checkout operations; implementation scratch stays in its own artifacts.

Only implementation needs an owned isolated checkout, with primary unchanged. Keep repository/branch/history/change/PR across machines; adopt a verified remote proposal or unoccupied local branch without resets. Preserve dirty owned resumes; report divergence, existing ownership, path collisions and unavailable dependencies separately. Dependency installation is explicit/need-based. Existing CLI aliases remain compatible. A1 enter/attach success is authoritative without a second inventory ritual; external agents use ordinary Git without A1 installation.

### Authority, progress and repository-owned guidance

A request to deliver through a PR includes scoped commits/pushes and metadata; edit-only does not imply publication and planning-only does not imply implementation. A clear request may approve scope and request implementation without another ritual turn. Renew approval for material scope/behavior changes, not wording clarifications. Merge, private export, remote abandonment and hosting mutation remain separately scoped.

Tasks map to outcomes without mandatory one-to-one groups/network barriers. Track local completion promptly; publish and synchronize truthful PR progress at coherent checkpoints and before handoff. One outcome is valid, including small/test-only fixes; no artificial second outcome or spec change is required when behavior contracts are unaffected. Keep code/test completion, focused observed results, required final-head CI and optional device observation distinct. Broader local checks are proportionate options, not mandatory repeated loops or prohibited diagnostics.

Repository-owned `.claude/skills/change-delivery/SKILL.md`, root guidance and project context describe the repository delivery route and trusted finalizer responsibilities through supported OpenSpec integration points. Remove only duplicate repository instructions, never OpenSpec-required steps. Leave generic OpenSpec propose/apply/sync/archive skills and generated commands unchanged; if repository expectations conflict with them, report a separately scoped blocker rather than edit or override the framework. Keep accepted historical contract-checkpoint and version-1/in-progress compatibility; do not manufacture historical completion.

### Handoff and safe local-only removal

Report repository, branch, change/PR, observed local/remote heads, publication status, remaining work and optional path. Clean status/detach/release does not prove push. No local handoff registration is required for remote-only drafts.

An explicit local-only removal request targets one checkout. Fresh read-only remote evidence must contain local HEAD; equal tips are not required when another machine safely advanced the branch. Open PR, pending CI, unfinished scope and absent archive/acceptance are irrelevant to this route. Keep remote refs/PR and local branch by default. Never reinterpret this as abandon/discard permission.

Replace force/recursive fallback with bounded lstat-based inspection, scoped locks, identity/claim rechecks and non-force Git removal. Unknown ignored files, private .xrbuild data, nested repositories/submodules, KEEP, dirty state, unsafe paths, live/unverifiable owners and unpushed/divergent commits remain protected. Disposable caches are narrowly enumerated; user data cannot be inferred disposable from .gitignore. Private preservation is a separately authorized operation, not automatic export. Preserve useful partial state and report blockers rather than retrying destructively.

Merged completion and explicit local removal use exact-target entrypoints; sweeps stay explicit separate bulk operations. Replace .a1/worktree.json broad completion with an exact operation after the compatible A1 API is released. Preflight before detach; trusted repository deletion only after shell exit and fresh rechecks. No runtime deletion fallback. Existing ordinary Git/standalone cleanup remains available; missing runtime support is a clear blocker, not permission to sweep. Repeated operations preserve recreated identities and unrelated worktrees.

### Readiness, hold and finalized drafts

Keep unambiguous Proposal/Implementation/Acceptance/Automation linkage and required completion. Accept one-or-more meaningful outcomes and flexible natural language; remove arbitrary count/style/lexical gates while retaining malformed-metadata and substantive validation failures. Local inspection and trusted promotion share one validator. Planning validation never means implementation readiness.

Use delivery-hold consistently across trusted promotion, finalization, automatic refresh and documentation integration, with fresh pre-mutation checks. Release triggers bounded reconciliation. Repair/resume finalized drafts from their archive/history without re-creating active artifacts; preserve exact candidate evidence and never infer merge authorization. Legacy ready version-1 bodies and openspec-in-progress handling remain compatible, without making split delivery the default for new work.

### Exact protected integration

Allow a fresh direct maintainer request naming the exact repository/PR/head/base candidate to be executed once through normal protected squash merge. Re-read identity, hold, finalization, required checks and applicable acceptance; bind expected head and refuse stale/pending/conflicting/ambiguous candidates. Existing non-strict base currency remains; do not add a hidden strict-current-base gate. No bypass, direct main push, independent merge choice or promise to merge later when CI becomes green.

Agents do not arm linked-implementation auto-merge. A personally armed route, if used, is scoped to the exact candidate and explicitly stale on relevant head/base/body/acceptance changes; fresh checks cannot substitute for fresh authorization. Ensure cancellation/reconfirmation uses verified arm ownership and exact evidence before advertising unattended continuation. Do not cancel unrelated human arms blindly or represent the native toggle alone as acceptance. Bot/controller integration authority remains limited to independently eligible routine docs under a separately enabled profile.

### Activation and private boundaries

Correct repository-owned delivery-skill and runbook promises to match live activation without editing OpenSpec skills. This change never activates Docs auto-merge, Nightly triage or OpenSpec reconcile. Conditional contracts describe their behavior only when separately reviewed and enabled. Docs eligibility excludes AGENTS, agent skills, governance/cleanup/privileged authority even under Markdown/docs paths; include full rename sources/destinations and preserve opt-out. Hold and no-auto-merge are blockers. Routine docs remain eligible only if the controller is enabled.

Keep current no-bypass protection, CI required, squash/linear policy and deployment trust. Declare any new label through reviewed governance; actual hosting apply remains separately confirmed. Public changes use neutral names and public evidence only. Private task-local clones stay independent; no shared private dependencies/output, automatic export or false device-validation claims.

## Risks / Trade-offs

- Stronger cleanup intentionally blocks cases old force-removal accepted -> report exact preservation reason and do not add unsafe compatibility fallbacks.
- Remote race/Windows locks -> fresh evidence, retained branch, exact identity and post-detach rechecks; no distributed backup claim.
- Runtime coupling -> release compatible A1 operation first; keep standalone paths and explicit unavailable-version behavior.
- Relaxed prose mistaken for reduced correctness -> negative fixtures keep identity/completion/required-check protections.
- Dormant workflow promises -> readback/report activation separately; do not claim integration exercised merely because source/tests exist.

## Migration Plan

1. Land coherent guidance and compatible tooling together through current trusted delivery policy; leave existing PRs/branches/history untouched.
2. Add portable planning/entry and safe standalone removal, preserving public/private boundaries and legacy metadata.
3. Adopt released A1 exact-operation interfaces without creating a mandatory runtime dependency.
4. Add hold/resume and exact-request merge safeguards; validate in disposable fixtures with mocked GitHub, never real private workspaces or live integration.
5. Keep all currently dormant auxiliary workflows disabled. Any later activation requires its own reviewed decision, explicit apply and observed readback.
6. Roll back entrypoints without deleting preserved data/history or changing required checks. Report operational/device observations separately.
