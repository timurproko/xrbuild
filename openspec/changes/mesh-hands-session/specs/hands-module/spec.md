# Spec Delta

## MODIFIED Requirements

### Requirement: Next-run selection and context notice
The selector SHALL save only post-processing selection/settings under common revision discipline, independently of source and adjustment drafts. Compatible Hands sessions and managed desktop runs SHALL follow committed configuration; older consumers SHALL receive next-run guidance without false live success. Browser previews, published web builds and offline packages SHALL remain excluded. Multiple-stage ordering and bypass controls SHALL remain absent.

#### Scenario: Save independently
- **WHEN** the person saves the mesh selection while source or adjustment drafts are dirty
- **THEN** those drafts remain unsaved, the running skeleton source is unchanged, and only supported post-processing delivery is attempted

#### Scenario: Context limitation
- **WHEN** the section is displayed
- **THEN** its context information identifies Hands live sessions and desktop apps run from this panel as supported, and browser previews, published web builds and offline packages as excluded

### Requirement: Post-processing delivery status contract
Post-processing status SHALL expose owner identity, desired saved revision, requested/applied generation, preparation state/progress/failure reason and current consumer drawing generation where supported. Missing evidence SHALL remain unknown. Skeleton-session acknowledgement SHALL not count as processor or drawing acknowledgement. Configuration persistence SHALL succeed independently of optional delivery failure.

#### Scenario: Saved but still preparing
- **WHEN** desired settings are persisted and their processor generation has not completed preparation
- **THEN** backend status distinguishes saved/applying from applied/drawing, exposes Preparing and leaves skeleton controls and acquisition unaffected

#### Scenario: Applied but not drawn
- **WHEN** a processor acknowledges a generation but no compatible SDK reports current valid drawing for it
- **THEN** status identifies applied settings without claiming the mesh is visible

#### Scenario: Hands owns mesh delivery
- **WHEN** an explicit Hands session is active and has a compatible mesh gateway
- **THEN** backend save/retry/status operations target that session's mesh run and never start a second provider or confuse its evidence with a managed app

#### Scenario: No Hands mesh session yet
- **WHEN** Hands is open but neither an explicit Hands session nor a compatible managed desktop run owns processing
- **THEN** backend configuration/status operations start no mesh or provider and do not claim live mesh delivery

## ADDED Requirements

### Requirement: Session-bound optional mesh viewport
An explicit live Hands session SHALL feed copies of its final sampled pose to optional mesh processing and draw returned geometry through shared standard SDK drawing and compensation. Geometry profile, hand identity, settings generation and topology changes SHALL retire incompatible mesh. Stop, stale/empty input, failure and page disposal SHALL clear mesh. Replay and idle navigation SHALL not implicitly create a live mesh consumer.

#### Scenario: Final sampled pose is dispatched
- **WHEN** an active session receives frames under nonidentity global size/offset and the mesh service is ready
- **THEN** the processor receives the same adjusted, filtered, sampled pose used by the viewport and interaction, with observation provenance and no second adjustment

#### Scenario: Live None or plugin replacement
- **WHEN** None, another plugin or changed settings are committed during Hands acquisition
- **THEN** old-generation geometry retires immediately, contained processing is configured or replaced safely and skeleton filters and held interactions are unchanged

#### Scenario: Mesh and skeleton switches are independent
- **WHEN** post-processing is enabled with any combination of Joints and Bones switches
- **THEN** valid mesh is shown independently and those switches alone govern skeleton components, including during preparation or mesh failure

#### Scenario: Discontinuity and disposal
- **WHEN** a geometry profile changes, input becomes stale/empty, or Stop/failure/disposal retires the session
- **THEN** old mesh and drawing evidence clear before the next render and late replies cannot reattach geometry to a replacement session

#### Scenario: Appearance changes while holding
- **WHEN** only appearance changes during a held interaction
- **THEN** mesh colour and skeleton appearance update without releasing the hold, restarting acquisition or invalidating compatible topology
