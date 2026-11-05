## 1. Trusted public workflow interface

- [x] 1.1 Add a bounded optional request identifier for run correlation while retaining the existing manual Actions UI inputs and default-branch-only trust gate; verify workflow tests reject malformed identifiers and never interpolate untrusted inputs into shell commands.
- [x] 1.2 Expose the approved public app identities and current site state to the private adapter without a local checkout; verify tests reject unknown identities, conflicting routes and a stale local manifest without altering `docs/`.

## 2. Local panel workflow jobs

- [x] 2.1 Add a neutral optional remote-publication capability and a distinct remote app list/card without local Build/Run or a second writer; verify panel tests show approved apps when no local public checkout exists and prevent a local Launcher from dispatching.
- [x] 2.2 Dispatch only allowlisted publish/unpublish operations from the loopback, same-origin panel server using an OS-backed maintainer login; verify tests cover unauthorized requests, absent/expired login, no browser token leakage, Unpublish confirmation and duplicate clicks.
- [x] 2.3 Correlate dispatch to the exact remote workflow run, poll its conclusion and refresh verified inventory and route; verify tests cover pending, success, cancellation, timeouts, correlation ambiguity, rollback failure and a panel restart without false success.

## 3. Integration and handoff

- [x] 3.1 Retain the private publisher's local-write refusal in Actions mode, preserve Actions UI as fallback, and document the difference between remote and local panel projects; verify focused plugin and panel tests, full Node suite, name guard and strict OpenSpec validation pass.
- [x] 3.2 Rehearse remote dispatch against a simulated service API and collect run diagnostics without changing production Pages or mutating an unrelated route; verify fixture status and public workflow tests pass before offering production publication.

A live panel-to-workflow test after both PRs merge is a separate maintainer-controlled follow-up; no production dispatch or Pages setting change is claimed during this change.
