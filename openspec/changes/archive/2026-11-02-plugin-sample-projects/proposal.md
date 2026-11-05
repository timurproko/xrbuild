# Proposal

## Why

A plugin can currently depend on a project that also appears as a mutable workspace project. The panel-managed tool
keeps that source open, archiving it can fail, and editing or deleting it can break the installed plugin. A fixture
input provider can also appear beside production providers even though it is intended only for diagnostics.

Plugin-owned sample projects should remain immutable installation content while users explicitly import independent,
ordinary copies that they can edit, archive or delete. Plugins also need a presentation-only way to keep an unfinished
or diagnostic provider out of normal project input choices without disabling the plugin's tools and samples.

## What Changes

- Plugins may declare bounded sample-project source folders in `xrb-plugin.json`. Plugins Manager shows those samples
  in the selected plugin's details with an Import action.
- Import copies a sample into `projects/plugins/<project-folder>`, rewrites its user-facing project identity, selects
  the independent copy in Control Panel and shows it under the `PLUGINS` project-list section. Imported copies have no
  runtime dependency on the installed plugin sample and use the normal project archive/delete behavior.
- Plugin metadata may hide selected native providers from normal project role choices while leaving the plugin,
  panel tools and sample imports enabled. Existing manifests are preserved rather than silently rewritten.
- The private development workspace moves its tracking diagnostic into its owning plugin as the original sample,
  points the managed tool at that source, removes the diagnostic fixture provider from the sample's inputs and hides
  that provider from the Input selector. The existing camera-backed provider remains available.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dev-control-panel`: add plugin-owned sample discovery/import and plugin-controlled provider visibility in project
  choices.

## Impact

- `packages/control-panel`: plugin manifest validation, plugin inventory/API, safe project copying, Plugins Manager
  details, project selection and focused tests.
- `templates/workspace`: plugin sample package discovery for newly created workspaces.
- Private development workspace: the diagnostic project moves beneath its plugin, its managed-tool module and package
  workspace paths change, and the plugin metadata declares the sample and hides its fixture provider.
- No plugin ABI, host channel, SDK hand stream or package format change.
