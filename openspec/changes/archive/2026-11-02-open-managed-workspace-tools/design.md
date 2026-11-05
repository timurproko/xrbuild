## Context

Workspace navigation currently treats every configured tool as an already-running external loopback site. That keeps navigation passive, but it also makes first use and post-restart use depend on an undocumented terminal command. The tracking diagnostic already has its own server middleware for recordings, panel status and authenticated local camera-service bootstrap, so copying only its static build into the panel would lose required behavior.

## Decisions

1. Extend `xrb-tools.json` with a mutually exclusive managed form: a stable panel-relative `route` plus a workspace-relative `module`. Existing `{url}` entries remain supported and passive.
2. Resolve managed modules canonically inside the selected integration workspace, reject symlink/path escape, duplicate/reserved routes, credentials and oversized configuration, and never accept a command line from tool metadata.
3. Define a generic workspace-tool lifecycle contract. The panel lazily imports one trusted module on the first request to its route, gives it the selected roots, panel origin and loopback HTTP server, and receives bounded request handling plus shutdown cleanup. Concrete server/framework integration stays in the workspace module, not the core.
4. Serve managed tools from the panel origin under their configured routes. The module may register additional validated local endpoint prefixes needed by its page, but cannot shadow panel, plugin, navigation, maintenance or project APIs.
5. Show a shared-design-system startup response while initialization runs. Concurrent requests share one startup attempt; a failed attempt is reported without crashing the panel and can be retried explicitly. A successful module remains active until panel shutdown or restart.
6. Loading a managed tool authorizes only its web runtime. The tracking diagnostic adapter must preserve its existing explicit capture/model/recording gates and must not create a native camera service until the page performs its existing same-origin explicit bootstrap action.
7. Reuse the selected workspace's installed package graph, or create that exact pinned graph through the panel's bounded `corepack pnpm install --frozen-lockfile` setup job when it is absent. Tool metadata cannot select an installer or command; setup failures remain actionable and never fall back to an external port.

## Rejected alternatives

- Automatically run a configured shell command: tool metadata would become command execution and would duplicate project job semantics.
- Keep a fixed extra port and spawn a child development server: this retains port collisions, dead links and cross-origin return/status handling.
- Serve only a static build: the diagnostic tool's bounded recording and local bridge endpoints would be missing.
- Move the concrete diagnostic into core: concrete workspace integrations must remain outside the generic core.

## Risks and mitigations

- A trusted workspace module executes in the panel process. This follows the existing workspace packager/publisher trust boundary; canonical containment and explicit configuration prevent remote or project-manifest injection.
- Tool middleware could shadow panel endpoints. Route/prefix validation reserves all core namespaces and dispatches only declared paths.
- Initialization can be slow. One shared bounded startup state gives visible progress, prevents duplicate starts and keeps the rest of the panel responsive.
- Tool cleanup can hang. Shutdown is bounded and errors are logged while panel termination continues.
