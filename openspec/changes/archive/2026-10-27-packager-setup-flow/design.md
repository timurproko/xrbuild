# Design: opt-in packager setup

## Contract and status

Extend the discovered packager with an optional pair of methods: a read-only, asynchronous readiness check returning `ready`, `setup-required` (with safe human-readable reason and optional terms URL), or `unavailable` (with reason); and an explicit setup action receiving only a job logger and a boolean indicating confirmed terms acknowledgement. A packager that implements setup must implement readiness; reject incomplete or malformed declarations during discovery. No core code imports or executes a toolchain-specific command. Packagers without these methods remain ready for the existing Build package action.

Do not run the readiness check as part of every manifest save or every live project-list refresh. Expose a project-scoped status endpoint for the currently selected packager, request it on selection/project change and after setup, and ignore responses for an older project or platform. A status check must not install anything. A failed check reports unavailable, never optimistically advertises Build package. Package-build API rechecks readiness just before starting a job and refuses unmet prerequisites with a setup-required response; stale UI and direct callers cannot bypass the gate. Validate selected project/packager again before setup, rather than trusting a client-provided plugin path.

## Setup job and UI

Setup starts through an authenticated same-origin, project-scoped POST and uses the existing bounded job log, event stream and conflict handling. One setup job runs at a time for the selected packager; reject competing setup/build requests that would mutate the same toolchain. The Setup action opens a dedicated progress state (or the existing progress dialog with a setup-specific title) and shows live lines. Setup does not run the project's web build, change its manifest/version, publish, or create a package. Successful completion triggers a fresh readiness check, then closes the dialog and swaps Setup for Build package; never auto-start a package build. If readiness still fails, or the job fails, keep the dialog/logs available and allow explicit retry. Background navigation remains usable; on reconnect, the running job and status are restored from server state. A ready packager shows Build package without flashing Setup.

If setup requires agreement to third-party terms, show the terms URL and require explicit acknowledgement before starting the job; the panel never silently agrees on behalf of the developer. Toolchain installation must not log secrets or pass arbitrary shell commands from HTTP input. Existing package progress and version confirmation remain unchanged.

## Workspace integration boundary

The private headset packager will implement the hooks to check the pinned CLI, compatible JDK, SDK and build tools and install missing components idempotently with logged progress. Preserve existing signing keys on retries, do not install or regenerate them merely to report readiness, and only package the configured canonical HTTPS route. That workspace change needs its own safe checkout/permission and tests, followed by an APK installation and launch check on hardware. It cannot be delivered by this public core PR alone.
