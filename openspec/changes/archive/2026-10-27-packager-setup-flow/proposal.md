# Guided packager setup

## Why

A workspace packager can require a platform toolchain that is absent on a new machine. Today Build package starts the app build before discovering the missing tools, then fails with an installation command. The developer needs a visible, deliberate Setup step before building, with progress and a recoverable failure state.

## What changes

- Add optional, platform-neutral readiness and setup capabilities to the packager contract. Existing packagers without these capabilities keep the current Build package flow.
- Display **Setup** instead of **Build package** for a selected packager reporting missing prerequisites; never start a web or package build from Setup.
- Start setup only on explicit user action, stream installation logs through a background job to a dialog, close the dialog automatically on success and change the action to **Build package** after a fresh readiness check. On failure, keep the dialog and logs visible and retain **Setup** for retry.
- Keep publisher operations independent of package setup. A headset launcher may use the configured published WebXR URL, but making an APK never publishes the site.

## Scope

The core PR adds the generic contract, guarded API, job and panel flow plus fixture tests. A separate integration in the user's private workspace packager must implement its toolchain checks/install (including any required terms acknowledgement), signing and launcher build. The core must not contain vendor tools, product identifiers or installer commands. Verify the final APK and immersive launch on a physical headset in that integration; do not claim device validation from the core's automated tests.
