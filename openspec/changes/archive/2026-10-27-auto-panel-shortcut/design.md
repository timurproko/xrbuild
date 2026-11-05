# Design

## Context

The ordinary launcher and `pnpm panel` currently resolve `XRB_HOME` or `%USERPROFILE%\.xr-build`; repository-development launchers explicitly select `<checkout>/.xrbuild`. The current Start-menu installer has one shortcut and changes its target only when rerun with `--repo`. The panel already uses ports 5180 and 5181 for the two launch modes. The user has clarified that the default user folder should also be named `.xrbuild`, at `%USERPROFILE%\.xrbuild`, distinct by location from `<checkout>/.xrbuild`.

## Goals / Non-Goals

**Goals:** One persistent shortcut created by the existing installer; choose user mode on each launch if the selected home workspace directory exists, even empty; otherwise choose that shortcut's checkout-local development workspace. Use `%USERPROFILE%\.xrbuild` as the ordinary default everywhere when `XRB_HOME` is unset; preserve `XRB_HOME` precedence, direct commands and a way to force either mode.

**Non-Goals:** Do not infer a user's workspace from the repository's contents for plain `start.vbs` or `pnpm panel`. Do not treat an empty user directory as an initialized workspace. Do not switch an already running panel's workspace, kill it, migrate files, set `XRB_HOME` globally or create a second shortcut.

## Decisions

### D1. Existence switches only the auto shortcut

The default Start-menu installer points its one shortcut at a checkout-relative auto launcher. At launch time, resolve the selected user workspace using the same `workspaceDir()` function as ordinary mode: `XRB_HOME` if set, else `%USERPROFILE%\.xrbuild`. Test **directory existence**, not whether it is an initialized workspace: an existing empty directory intentionally produces the user-mode setup dialog on port 5180. When the user directory is absent and the current checkout's `.xrbuild/` exists, select that repository workspace explicitly and launch on port 5181. If neither directory exists, use ordinary user mode so a clone without an embedded workspace gets the normal setup flow.

Only the auto shortcut uses this existence-based policy. Ordinary panel and workspace dependency commands use `XRB_HOME` if set, else the new `%USERPROFILE%\.xrbuild` default; `start-repo.vbs`, `pnpm panel:repo` and direct `--workspace` continue to select the checkout explicitly. The auto launcher is an explicit developer-aware entry point, not a change to ordinary mode's no-fallback behavior. It evaluates the directories afresh for every launch, so creating or removing the home workspace toggles the next launch without rerunning the installer.

### D2. Reuse one panel startup path

Have the auto launcher pass a dedicated selection flag to the panel startup code (or an equivalent small router that imports the same workspace resolution), rather than duplicate `XRB_HOME` and Windows path rules in VBScript. In the user case, start without an explicit workspace argument to retain port 5180 and the ordinary environment precedence. In the development case, pass the current checkout's `.xrbuild/` explicitly to retain port 5181. The existing ping-based single-instance check must still reuse only a server serving the selected workspace; if the selected port belongs to a different workspace, refuse rather than open the wrong panel.

*Alternative:* hardcode `%USERPROFILE%\.xrbuild` even when `XRB_HOME` is set, or make `start.vbs` auto-route. Rejected: an explicit `XRB_HOME` still selects a user's workspace, and ordinary commands must not automatically select the repository. The old `%USERPROFILE%\.xr-build` directory is not moved or deleted; users can explicitly retain it with `XRB_HOME`.

### D3. Keep explicit escape hatches

The existing installer `--repo` continues to force the repository launcher for that one shortcut. Add a clear `--user` option to force the ordinary launcher; rerunning the installer with no option restores auto mode. All modes use a checkout-relative target, not a permanent `XRB_HOME` or a saved absolute workspace path; the shortcut still needs reinstalling if its checkout moves or is removed. Document use from a stable checkout, not a task worktree.

### D4. Keep requirement length advisory

OpenSpec 1.14.1 reports requirement bodies over 500 characters as a WARNING; the trusted finalizer validates the synced specification with `--strict`, so a 501-character modified requirement blocks archival even when change validation passes. OpenSpec 1.11.0 reports the same finding as INFO. Pin 1.11.0 for both the XR Build package and CI's OpenSpec invocation, retaining strict validation for other warnings and errors. Verify an overlong requirement archives successfully and a missing scenario remains blocked. The generated local skills need not be rewritten merely to change validation severity.

The PR's finalization workflow runs the trusted CLI from **main**, not from the candidate. Keep the modified shortcut requirement below 500 characters for this PR's initial finalization; once the change is merged, subsequent CI and finalizations use the aligned pin. Do not bypass archive validation or relax `--strict` as a whole.

## Risks / Trade-offs

- [An old user panel keeps running after the directory is removed] → The next auto launch chooses port 5181 and opens the repository panel, leaving the old server on 5180 untouched. Creating the folder later selects user mode on 5180 again.
- [A user home directory is empty] → This is intentional: user mode displays setup rather than silently opening repository projects.
- [`XRB_HOME` points to an absent directory] → Only the auto shortcut selects the repo; direct user entry points still follow `XRB_HOME` and show setup.
- [An existing user relied on `%USERPROFILE%\.xr-build` with no `XRB_HOME`] → No implicit migration: explicitly set `XRB_HOME` to keep using that workspace; the new default can show setup instead.
- [The installed checkout lacks `.xrbuild/`] → Fall back to the ordinary user launcher; no broken developer path.
- [Another checkout already serves port 5181] → Keep mismatch refusal and allow the existing per-process `XRB_PANEL_PORT` override.
- [Shortcut installed from a disposable worktree] → Document installing from a stable checkout; do not infer a primary checkout from a task worktree.
- [Older OpenSpec CLI changes other validation behavior] → Run both the current change and full-spec strict validation plus finalizer tests, including a negative invalid-spec fixture. The pin is explicit and can be upgraded separately with equivalent length guidance.

## Rollout

Change the ordinary default in both panel and workspace dependency tooling, add the auto-selection path, change the installer's default target to it while keeping explicit modes, and test directory absent/present/empty, environment precedence, port and running-instance behavior. Run focused tests, the name guard, strict OpenSpec validation, and finalizer fixtures proving informational length guidance and blocking structural failures. Check `/api/ping` for both modes using isolated temporary environment settings without changing any real user folder; leave installing the actual Windows shortcut in the stable checkout until after merge.
