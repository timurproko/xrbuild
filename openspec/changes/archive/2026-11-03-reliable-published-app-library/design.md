## Context

The production inventory legitimately contains an empty slug when the launcher owns the publisher's `/apps/` root. The launcher catalog validator currently requires every slug to be a non-empty string, so that one record aborts the complete catalog before named apps are enriched. The page already filters its own route after loading, which is sufficient once root entries can be represented.

The panel currently models jobs as running, done or failed and refuses a second job of the same kind. That is appropriate for most mutating work, but publication is already serialized by the publisher and users can reasonably submit independent app operations while a deployment is being verified. Rejecting the second request produces an error instead of preserving intent.

Browser-build finalization already materializes the authoritative project icon as `xrb-app-icon.png` and injects one cache-busted favicon link before the receipt is accepted. The catalog should use that guaranteed artifact as its fallback, and queued execution must retain the same finalization path rather than publishing an older tree.

## Decisions

### Root-safe published catalog

Accept `slug: ""` as the root publication and retain the existing normalized named-slug rules for every non-empty value. Build a root entry's route as `/apps/`; named entries remain `/apps/<slug>/`. The launcher filters itself by canonical route pathname, so a root launcher excludes the root record and a named launcher excludes its named record without special identity configuration. Other root or named inventory entries continue through the same metadata enrichment and ordering.

Prefer a same-origin web-manifest icon when one is declared and valid. When no usable manifest icon exists, use `xrb-app-icon.png`, which the panel guarantees in every finalized browser build, rather than assuming each app copied `icon.png` itself. Metadata failures remain per-app fallbacks and do not discard otherwise valid inventory entries.

### FIFO publication jobs

Extend the background-job model with an explicit queued state. A valid Publish or confirmed Unpublish request creates and returns a job immediately. If no publication operation is executing, it starts at once; otherwise it remains queued and is visible through the existing jobs API and event stream. Publication jobs start in request order, with at most one executing globally.

Only a conflict caused by another publication job becomes a queue. Existing unsafe conflicts remain refusals: publication cannot be accepted while the same project's web/package work is active, and queued publication reserves that project against later web/package work until its operation ends. The scheduler is pumped whenever a job completes, so a temporarily blocked head operation starts when its conflicting work is gone without allowing later publication requests to overtake it.

A queued job captures the requested project, publisher, slug and operation for status/UI presentation. On execution, Publish follows the normal current-build preparation and receipt verification path, including favicon finalization; settings or output that became stale still rebuild or fail honestly. Unpublish targets the captured publication identity. Reloaded clients reconstruct queued and running state from `/api/jobs` and job events.

### Publication UI

Treat queued and running publication jobs as pending for their project. The Build card keeps Publisher and Slug pinned and disabled, shows the requested Publish or Unpublish operation, and does not submit a duplicate action. Activity distinguishes queued work from active work while retaining logs and completion behavior. Only a transition from running to done applies optimistic deployment feedback; queued jobs do not claim remote progress or success.

### Icon verification

Keep icon ownership in core browser-build finalization rather than in app-specific Vite files or the production publisher. Add integrated publication coverage proving a custom project icon reaches the finalized HTML and copied PNG before the publisher is called, including when the publication waited in the queue. Launcher tests prove a published app without a web manifest or `icon.png` still receives the finalized icon URL. No production Publish is used for automated verification.

## Risks and Bounds

- A queued operation can wait behind a long deployment. It remains visible and cancellability is out of scope; no intent is silently dropped.
- Project settings may change while queued. Publish revalidates at execution and fails rather than publishing an unverified snapshot; the selected publication identity stays pinned for UI clarity.
- Global FIFO is deliberately conservative because publishers can share one public site. Parallel publication across different publishers is out of scope.
- A malformed inventory still fails as a whole; only the valid empty root slug changes. Route metadata fetch failures continue to fall back per app.
- Browser favicon caches are not controlled by the publisher. The existing content-derived query token remains the cache invalidation mechanism.
