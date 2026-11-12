# Prerequisites and ownership

- Base inspected: core main `a26c2f6`, including embedded refresh implementation accepted in `5e2c5cd`.
- Owner: core control panel plus already-approved core-owned embedded Launcher. No private clone or private PR is needed; test data is synthetic/public.
- Existing active predecessor order remains `user-workspace-public-core` → `split-private-workspace` → `bundled-extensions`. This change does not edit their deltas or task completion. Its implementation baseline is the accepted public tree; no pending predecessor implementation is requested here.
- This successor adds narrow sidebar/development-catalog refinements. Before final delivery, trusted repository automation must establish the applicable predecessor synchronization order and synchronize/archive this change against the real accepted baseline. Do not manually finalize predecessors or overwrite canonical specs to bypass that gate.
- Plan publication and implementation require the maintainer permissions recorded in repository instructions. Attachment grants no merge, cleanup, private export or running-process restart authority.
