# Shortcut startup and automatic app setup

The ordinary **XR Build** and **XR Build Dev** shortcuts keep their existing destinations. After a pull or first checkout, a shortcut can install the public core's missing app dependencies before entering the panel server. You do not need to discover an install command or open a terminal.

## What you see

- A ready installation opens normally; an already responsive panel with the same core/workspace/projects is reused.
- If setup is required, a browser page shows a modal using the Rebuild dialog's visual style: **Checking XR Build**, **Installing app dependencies**, then **Starting XR Build**. The output is live, not an estimated percentage. The modal appears before installation begins.
- On success, that same tab opens the verified requested panel. The temporary setup page is not a second application instance.
- A failure stays visible with its reason, output, **Retry**, **Copy log** and **Close**. Fix the reported problem and choose Retry; setup never loops automatically or falls back to changing the lockfile.
- Closing the browser tab does not cancel an active installation. Reopen the shortcut to return to its progress. Repeated shortcut clicks share setup rather than starting competing installs. Close/Escape inside active progress cannot silently interrupt it.

The setup log is under `%LOCALAPPDATA%\XRBuild\startup\startup-<checkout>.log`. The dialog gives its exact location. It is bounded and sanitized; copied output excludes credential values. Server diagnostics before normal logging starts also appear here. Normal panel logging remains under `%LOCALAPPDATA%\XRBuild\logs\control-panel.log`.

## Scope and prerequisites

Only this selected public core's `packages/*` and `tools/*` graph is installed. Setup uses the exact `packageManager` pin with a frozen lock and lifecycle hooks disabled. It does not change tracked manifests/workspace declarations/lockfiles, install another checkout's packages, enable a private graph, build native code, fetch models or activate devices. Managed-tool dependency setup remains separate from optional user-workspace initialization.

A supported Node.js with built-in TypeScript support is required (22.18+ or a current LTS). Corepack must be available beside that Node installation. It may download the repository-pinned package manager into its normal user cache, with progress visible. The shortcut does not install Node, global tooling, shims or native SDKs. If the bootstrap cannot run or open its page, a native diagnostic gives the prerequisite/error and log location.

An unrecognized workspace graph, unsafe local package link or checkout-local `.npmrc` requires manual review; automatic setup will not inherit another install scope or arbitrary package hooks. Ambient package-manager routing/hook overrides and global/user npm configuration are not applied by the frozen install. Offline/network, write-permission, manager-version and lock mismatch errors remain explicit. If a pull changes inputs during setup, retry only once the checkout is stable.

If this core is already in use but needs dependency repair, close its existing panel first. Setup will not change dependencies underneath it or force a new restart. Responsive foreign workspace/core panels are not adopted; normal explicit restart and verified shortcut recovery policies remain separate. Distinct user/development modes serialize core setup but retain their own workspace/project/port selection.

## User workspace

The panel reads `XRB_HOME`, otherwise `%USERPROFILE%\.xrbuild`; a missing, empty or uninitialized folder is valid. Apps, Plugins and Settings open without Create your workspace or an automatic New project dialog. Available embedded apps remain visible. Browsing and startup do not initialize the selected folder or rewrite its editor configuration.

Confirming New project creates the missing standard package-workspace files, editor mapping and only the requested template app; Cancel/Escape creates nothing. Existing root files are preserved, and separate project repositories receive project-only scaffolding. Explicit settings, build and configuration actions may create their required user-owned storage lazily without generating a starter app. This user folder requires no Git clone or worktree. Explicit development workspace selection and repository dependency-install policies are unchanged.

## Development and recovery

No shortcut reinstallation is needed when an unchanged checkout path receives this update: its existing script entry point now enters the dependency-free bootstrap. Install or retarget Start-menu shortcuts only from a stable checkout, never from a disposable task worktree. CLI `pnpm panel` and `pnpm panel:repo` remain ordinary terminal commands and do not gain hidden GUI setup behavior.

The temporary UI binds to loopback only, uses a per-session capability and explicit route/asset allowlists, and accepts no arbitrary command or filesystem input. Unknown setup owners are not killed and stale coordination files are not automatically removed. Setup ownership is tied to the process; a Windows named-pipe rendezvous disappears when its owner exits.
