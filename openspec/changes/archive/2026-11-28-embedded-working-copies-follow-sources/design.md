# Design

## Context

Embedded apps are shown from durable working copies under `<projects>/.xrb/embedded-projects/`. Only an explicit action (Run, Build, publish, package, icon) called `prepareEmbeddedProject`, which detects a changed installed source and runs the three-way merge (`refreshProject`). Discovery reads the working copy as it is, so after a core update the list kept showing old manifests.

## Decisions

- **Reuse the action path.** `refreshEmbeddedProject()` takes the same per-project operation lock and calls the same `prepareProject()` merge. It returns early, without creating anything, when the project has no working copy, so discovery stays read-only and unmaterialized projects stay unmaterialized.
- **Read-only staleness check.** `embeddedSourcesChanged()` compares the saved baseline and input fingerprint with the installed source without writing, so the job only touches changed projects and current ones are left alone.
- **One visible job.** A new `project-refresh` job kind runs after panel start and after a successful Rebuild or Update. Failures (conflict, invalid or interrupted state) fail the job with per-project lines.
- **Visible reasons.** Refused or deferred projects get a `refreshProblem` message (also added to the project's errors). A successful later refresh or Run/Build clears it.
- **Busy projects.** A project whose app runs or that has a job is skipped and marked pending; the refresh is retried when jobs end or a run releases its project lock.

## Risks

- The refresh job briefly blocks other jobs that cannot overlap it (Run preparation, Update); it is short and retried when refused.
