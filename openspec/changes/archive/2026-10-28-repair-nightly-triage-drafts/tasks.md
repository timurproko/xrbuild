# Tasks

## 1. Restore least-privilege triage

- [x] 1.1 Give the nightly triage job read-only Actions access plus issue label/comment access and pass the workflow token separately from the repository App token; verify policy tests assert `actions: read`, `issues: write` and the two credentials have distinct uses.
- [x] 1.2 Route run, job, log and Issues operations through the workflow token while keeping the branch push and pull-request creation on the App token; verify unit tests use separate fake clients and fail if an Actions or Issues endpoint receives the App credential.

## 2. Generate an actionable repair

- [x] 2.1 Render the generated PR with a scoped proposal, two unchecked implementation outcomes, one acceptance outcome and the OpenSpec link; verify the body passes the trusted promotion layout inspection while remaining incomplete.
- [x] 2.2 Put the failed run link, jobs, failed steps and bounded sanitized log excerpts in the initial PR comment and generated change design, with matching reproduce/fix/prove tasks; verify unit tests cover each evidence field and repeat-failure comments.

## 3. Prove the workflow

- [x] 3.1 Run the PR automation tests and name guard, then manually dispatch nightly triage against a retained successful scheduled CI run; verify the workflow succeeds, reports no action and opens no repair PR.
