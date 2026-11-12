## ADDED Requirements

### Requirement: Declared branch-refresh automation
The reviewed governance declaration SHALL name branch refresh as an explicit privileged workflow role with its trusted entrypoints. Full activation SHALL include that role only after its trusted main policy and existing App prerequisites are available; CI-only activation SHALL keep it disabled, and protection-only mode SHALL not mutate workflow activation. Planning and readback SHALL agree on these profiles. Branch refresh SHALL NOT relax required checks, introduce a bypass, change merge policy, enable unrelated auxiliary workflows or treat committed policy as proof of live event production.

#### Scenario: Full activation profile
- **WHEN** an explicitly confirmed full activation has trusted refresh policy on main and the required App configuration
- **THEN** governance includes refresh among its declared enabled workflows and verifies that state by readback without weakening protection

#### Scenario: CI-only and protection-only modes
- **WHEN** governance plans or applies CI-only or protection-only mode
- **THEN** CI-only keeps privileged refresh disabled and protection-only leaves workflow states unchanged

#### Scenario: Missing trust or undeclared workflow role
- **WHEN** full activation cannot verify refresh policy on main or encounters an unreviewed workflow role
- **THEN** it reports the blocker rather than executing candidate policy or silently treating privileged refresh as ordinary CI

#### Scenario: Source landed but events unobserved
- **WHEN** the refresh workflow and governance declaration have merged but no live branch update and downstream CI have been observed
- **THEN** operators report the unobserved rollout evidence separately and do not claim that source presence certifies automatic refresh
