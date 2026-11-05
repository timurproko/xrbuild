## Why

The Plugins Manager currently exposes stale generated plugin folders as real integrations, takes display versions from inconsistent runtime/package sources, and presents one maintained hand-tracking implementation under multiple user-facing identities. Opening its managed tool can also appear to launch a terminal, which makes ordinary application navigation look like development setup.

## What Changes

- Require every workspace plugin manifest to declare a bounded semantic version and use that manifest as the Plugins Manager's display identity/version source.
- Treat only manifest-backed workspace folders as plugins, so renamed artifact-only folders are neither shown nor loaded as providers.
- Present the maintained tracking implementation and its managed tool consistently as **Hand Tracking**.
- Give the separate calibrated-rig integration its intended private workspace label, expose it in the Input selector while enabled, and retain its stable internal provider identifier for compatibility.
- Set every maintained private workspace plugin manifest to version `0.1.0`.
- Let enabled plugin metadata provision optional standalone platform tabs, so disabling the plugin that owns the standalone browser target removes its tab immediately without rewriting saved projects.
- Ensure following the Hand Tracking menu entry initializes inside the panel without launching a visible console, installer, compiler, development command or child service; camera/model/native capture remains explicit.

## Scope

This changes generic plugin-manifest/catalog behavior and private workspace presentation. It does not merge the independent calibrated-rig provider into the maintained tracking implementation, rename stable provider IDs, delete user data, or authorize camera/model/capture startup during navigation.
