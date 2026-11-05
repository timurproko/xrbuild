## Context

The sidebar derives `published` only from remote publisher status, while Activity derives queued/running state from the local job inventory. Active publication jobs already survive reload and carry the project identity and operation, so no server contract is required.

The shared `.state` component already defines the desired visual language: `.busy` is the queued yellow treatment, `.live` is the running blue treatment with an animated dot, and `.ok` is the completed green treatment. Sidebar-specific CSS currently replaces the yellow and green treatments with stronger fills, making the same states inconsistent.

## Decisions

1. Active local publication jobs take priority over remote publication status in the project sidebar. A queued job renders `queued` with `.state.busy`; a running job renders `running` with `.state.live`.
2. Use the shared state component without sidebar color overrides. The existing `.live::before` animated dot provides the same running indication as Activity.
3. Keep one badge position. The active job badge replaces `published` rather than adding another badge, avoiding competing states in the narrow project row.
4. When no local publication job is active, derive `published` from effective per-publisher status, including the bounded optimistic completion override already used by the Build card. Successful Publish therefore becomes green immediately; successful Unpublish removes the badge immediately while remote polling converges; failure restores the prior remote state.
5. Re-render the project list when a publication request is accepted and whenever its job transitions among queued, running, done or failed. Initial loading already restores jobs before projects, so reload naturally paints the active badge.
6. Badge text remains state-oriented (`queued`, `running`, `published`). The job title and Build card continue to communicate whether the operation is Publish or Unpublish.

## Risks and Bounds

- A project can have one running and later queued publication work. Existing active-job ordering keeps the running job visible first; after it completes, the next queued job becomes visible.
- Remote publisher `failed` continues to mean published but unreachable and keeps its existing tooltip, now using the shared warning tone.
- This change does not alter queue order, disablement, publication actions or publisher status polling.
- Tests exercise UI source and shared component contracts without contacting a production publisher.
