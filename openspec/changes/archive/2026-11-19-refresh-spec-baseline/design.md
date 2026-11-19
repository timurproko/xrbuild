## Context

The canonical specifications had drifted from the code in three ways: they specified how changes are delivered, which
the shared delivery workflow owns; they carried one-time migration procedures that are finished; and they contradicted
or omitted behaviour the code already has. This change touches specifications only.

## Goals / Non-Goals

**Goals:**

- Every requirement in `openspec/specs/` describes behaviour the code in this repository has today.
- No requirement states a delivery rule or a finished one-time procedure.
- Implemented behaviour that agents need to know about is specified.

**Non-Goals:**

- No code, test or documentation change.
- No change to the Purpose paragraphs of existing specifications; deltas cannot express that.
- No new behaviour. Where the code and a requirement disagree, the requirement changes.

## Decisions

- **The code wins.** A requirement the code contradicts is rewritten to what the code does, for example the default
  cursor style and the return control. A disagreement that looks like a defect is recorded in the proposal rather than
  specified away.
- **Two capabilities are retired whole.** `change-delivery` and `public-history-export` lose every requirement, and
  the change declares `retire_capabilities: true` so their specification files are deleted when it is archived.
- **A requirement that must lose a scenario is replaced, not modified.** Strict validation refuses a modified
  requirement that drops a scenario, so `ci-validation` removes "Jobs by changed paths" and adds "Job selection by
  event and changed paths".
- **New capabilities carry their Purpose in the delta**, because the placeholder an archive would otherwise write
  fails strict validation.
- **The pending synchronization is folded in.** The one requirement of `repair-dev-workspace-startup` moves into this
  change unchanged and that change is deleted, so one archive brings the specifications up to date.

## Risks / Trade-offs

- Requirements were verified against the code by reading it, not by running it → a wrong reading becomes a wrong
  specification. The proposal lists what was carried over without independent verification.
- Removing governance requirements leaves the task checkout helper without a specification → it is small, covered by
  its own tests and described in the development documentation.
