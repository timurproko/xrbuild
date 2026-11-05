## Why

A control-panel process started before an update can read newer workspace-tool configuration with its older validator. The panel already identifies that its server code is stale and presents **restart available**, but it also opens a generic error dialog for the expected compatibility mismatch. After restart, an existing but stale workspace package graph can also make a managed tool show a missing-package Retry page instead of repairing itself. Both cases make a normal pull-and-open workflow look broken.

## What Changes

- Suppress workspace-tool navigation configuration dialogs only while the panel has positively identified that its own server code is outdated.
- Keep the existing restart chip and Restart menu indicator as the visible action.
- Continue reporting navigation configuration errors when the running panel is current or freshness is unknown.
- Detect a stale/incomplete pinned workspace package graph and run the existing bounded frozen-lockfile setup job before importing a managed tool.
- Retain suppressed compatibility messages in developer diagnostics.

## Scope

This refines compatibility presentation and managed-tool dependency readiness. It does not make stale server code interpret newer configuration, automatically restart the panel, accept commands from tool metadata, hide unrelated errors, or alter restart/rebuild authorization.

## Capabilities

- No requirement changes; this is a presentation fix for the existing panel freshness and navigation behavior.
