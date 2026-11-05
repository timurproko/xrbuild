## Why

A configured workspace tool currently opens only a loopback URL. After its separate development server stops, navigation leads to a refused connection and the developer must run terminal commands before the tool works again. A tool presented as part of the Control Panel should open from the panel as reliably as Plugins Manager while retaining explicit device and model authorization.

## What Changes

- Let a trusted integration workspace register a panel-managed tool with a stable panel route and a contained workspace module instead of requiring a separately running port.
- Lazily initialize the registered module on first navigation, serve its page and local APIs through the panel origin, show bounded startup/error/retry presentation, and close it with the panel.
- Retain existing validated external loopback links for tools intentionally hosted elsewhere.
- Register the workspace tracking diagnostic as a managed tool so its navigation entry opens without a terminal command; loading it still starts no camera capture, model worker, recording, or native camera service.

## Scope

This change manages the web-tool runtime only. It does not auto-start capture, grant camera permission, initialize hand inference, start recording, rebuild the host, or claim that diagnostic fusion is physically accepted. Concrete tool code remains in the integration workspace; the core adds only a generic bounded lifecycle contract.

## Capabilities

- Modified: dev-control-panel — managed workspace-tool routing and lifecycle.

## Impact

Control Panel navigation/config validation, local HTTP routing and shutdown; one generic workspace-tool module contract; the private workspace tool registration and adapter. Existing project Run behavior, Plugins Manager, external tool links and maintenance confirmation remain independent.
