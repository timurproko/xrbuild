## Context

Repository-development panels select the checkout's tracked workspace. Its managed tools prepare workspace dependencies before the server binds its port. That preparation currently uses a frozen dependency install, so a changed workspace package manifest makes the hidden launcher exit without opening the panel. Managed tool routes already model failed setup as a retryable state, but eager setup currently propagates its failure through overall launch.

## Goals / Non-Goals

**Goals:**
- Reconcile a repository checkout's workspace dependencies when its lock is stale or absent.
- Start the panel even if a managed tool remains unavailable, retaining the tool's existing retry path.
- Retain reproducible frozen installation for ordinary and arbitrary explicit workspaces.

**Non-Goals:**
- Run arbitrary workspace scripts or install arbitrary package managers.
- Repair dependency locks for user or arbitrary explicit workspaces.
- Hide dependency-install failures from the affected managed tool.

## Decisions

### D1. Repository workspaces bootstrap their dependency graph

The repository-development mode will use the existing workspace package bootstrap path with lock reconciliation enabled. It already stamps the complete package graph after a successful install, so it only installs when manifests or the workspace declaration change. The repository workspace is deliberately editable development state; refreshing its tracked lock is preferable to a hidden launcher failure after a pull.

Ordinary and explicit workspace modes retain frozen installation. Making every mode permissive was rejected because it could silently rewrite a user-selected workspace's dependency lock.

### D2. Tool setup is isolated from panel availability

Managed-tool initialization will keep recording its own error state rather than allowing a setup error to abort server startup. The startup path will still await successful tools before opening the browser, preserving current ready-on-open behavior; failed tools use their existing failure page and retry endpoint.

Starting the panel before any managed tool has settled was rejected because it would make healthy tool routes race the initial browser load.

## Risks / Trade-offs

- [Repository startup modifies its workspace lock after dependency declarations change] → Limit lock reconciliation to repository-development mode and only when the package graph stamp is stale.
- [An unavailable tool no longer stops startup] → Keep the detailed failure visible at its route and retryable, while logging the failure.
- [Dependency installation can take time after a pull] → Keep the existing bounded launcher behavior; subsequent launches skip work once the graph stamp matches.

## Migration Plan

No shortcut reinstallation or manual cleanup is required. The next repository-development launch reconciles a stale workspace graph. Rollback restores frozen repository installs; the refreshed lock remains a valid workspace artifact.
