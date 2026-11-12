# Prerequisites and ownership

- Core-only CI/governance policy. No private workspace clone, private source, device acceptance or export is needed.
- Planning base: main commit `5cd1c35065148c6382e0b66e0f02b6a6dba624a9`, including trusted promotion/finalization, the required aggregate and shared implementation-progress guidance.
- The active `pr-delivery-governance` change retains unfinished historical operational/companion scope. This successor adds narrowly named requirements to existing canonical `ci-validation` and `repository-governance`; it neither replaces predecessor requirements nor marks historical tasks complete. Leave predecessor plans and spec synchronization/archive to the normal bot.
- The maintainer approved draft PR #12's plan and explicitly requested implementation (`yes implement it`). Continue in this branch and PR; this approval does not authorize hosting applies, merges or live canary creation.
- Full automation needs the existing repository App installed with Contents and Pull requests write, its declared variable/secret, and trusted workflow/scripts on main. Source/settings presence is not proof of installation permissions or downstream CI events.
- Live activation is separate from implementation: inspect preflight first and obtain explicit confirmation before applying hosting settings. Preserve protection and inactive auxiliary workflows; never bootstrap by running candidate policy with privileged credentials.
- Live post-merge branch-update and exact-head CI evidence remain rollout observations, not pre-merge completed tasks. Only the maintainer merges. This change does not depend on merging any unrelated ready PR.
