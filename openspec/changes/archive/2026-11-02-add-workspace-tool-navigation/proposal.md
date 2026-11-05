## Why

The operator approved adding workspace-tool navigation to the existing task worktree and requested a stable, fully styled first paint. Navigation must be separate from maintenance actions and must not start acquisition or alter tracking algorithms.

## What Changes

- Put Control Panel, configured workspace tools and the standalone Plugins Manager first in the header menu, followed by a separator, Restart and Rebuild.
- Read bounded, validated loopback tool links from the selected integration workspace's optional `xrb-tools.json`; keep concrete tool locations out of the core.
- Give Plugins Manager its own stable `/plugins/` URL and share navigation URL/keyboard behavior with workspace tool pages. Returning through a maintenance link requires confirmation on the panel; a GET never starts an update/restart.
- Load the tool's stylesheet before its application module and reveal the populated layout only after initialization, with a visible startup-error fallback. Give each developer tool a stable `XR Build · Product Name` title and designated emoji favicon; reserve project icons for app previews/windows.

## Scope

This is navigation and startup presentation only. It does not publish live hands to applications, improve fusion, auto-start devices/models, start a new tool service, or replace existing consent/ownership/security checks. Tool links open the configured running local service. The branch may be pushed for review, but only the maintainer decides whether to merge it.

## Capabilities

- Modified: dev-control-panel — workspace-tool navigation and separated maintenance actions.

## Impact

Core panel server/UI and generic navigation helpers; workspace tool registration and startup UI. Existing host jobs, restart confirmation and freshness indicators stay intact. The operator's primary panel is not restarted or modified by this worktree. The maintainer requested pushing this branch for review; merging remains maintainer-owned.
