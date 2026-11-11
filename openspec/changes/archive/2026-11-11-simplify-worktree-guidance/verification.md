# Verification and integration prerequisite

The root Worktrees block is identical to the runtime repository's shared block. Delivery instructions route to it without requiring a second inventory sample or exposing internal recovery recipes. Public dependency setup stays separate, private clones remain independent, and private/KEEP cleanup protection and maintainer merge authority remain intact.

Local checks passed:

- Fifteen focused Node tests covering instruction guidance, dependency linking, dirty/active/merged cleanup states, private and KEEP preservation, failure/resume, and handoff.
- Name guard: zero banned-name findings.
- Strict change validation: passed.

The instruction migration is implemented, but deployment is intentionally ordered: install a runtime release exposing `worktree enter`, `attach`, `detach`, and `list` before integrating this PR. Older runtime versions may ignore unknown commands silently. This PR neither publishes nor installs that runtime, and the local checks do not claim an installed end-to-end acceptance or remote CI success. The PR retains `no-auto-merge`; only the maintainer chooses integration after the prerequisite is satisfied.
