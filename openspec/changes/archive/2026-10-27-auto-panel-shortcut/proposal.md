# Proposal

## Why

The Start-menu installer currently targets user mode unless the maintainer manually reruns it with `--repo`. The maintainer wants one stable shortcut that chooses repository development when there is no home workspace, but lets them create an empty home workspace to exercise the same setup flow as an ordinary user, without reinstalling or retargeting the shortcut.

## What Changes

- The installer's default creates one checkout-relative, auto-routing XR Build shortcut. Each launch checks whether the selected user workspace *directory* exists: `XRB_HOME` when set, otherwise `%USERPROFILE%\.xrbuild`. An existing directory, even empty, launches normal user mode on port 5180; an absent directory launches the current checkout's embedded `.xrbuild/` on port 5181.
- When the checkout has no embedded workspace, the auto shortcut uses the normal user launch and setup flow instead of pointing to a missing development workspace. Preserve explicit `--repo` mode and allow an explicit user-mode shortcut for people who do not want auto selection.
- Change the ordinary user default (when `XRB_HOME` is unset) from `%USERPROFILE%\.xr-build` to `%USERPROFILE%\.xrbuild` consistently in the panel and workspace dependency tooling; preserve `XRB_HOME` precedence and the direct command behavior otherwise. The old folder is neither migrated nor deleted; users can still select it with `XRB_HOME`. No workspace folder is created or deleted by the router.
- Keep OpenSpec length guidance advisory: requirement text over 500 characters is informational, not a strict-mode failure. Pin the same OpenSpec CLI for XR Build's CI and finalization; keep actual specification errors and other warnings subject to strict validation.

## Capabilities

### Modified Capabilities

- `dev-control-panel`: the Start-menu installer's default becomes one auto-routing shortcut, while direct launch modes remain explicit; the user-mode home default changes to `.xrbuild`.
- `workspace-location`: the ordinary default without `XRB_HOME` becomes `%USERPROFILE%\.xrbuild` for the panel and dependency tooling.
- `ci-validation`: overlong OpenSpec requirements remain advice rather than blocking finalization or CI.

## Impact

- Start-menu installer, a shortcut-only launcher/selection path, user default in the panel and workspace dependency tooling, pinned OpenSpec CLI and CI validation version, focused tests and developer documentation.
- No new global environment variable, second shortcut or plugin integration; direct user commands retain their semantics but use the new default folder when `XRB_HOME` is unset.
