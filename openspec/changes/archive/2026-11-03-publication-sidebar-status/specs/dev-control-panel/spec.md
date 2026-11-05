## MODIFIED Requirements

### Requirement: Queued publication operations
Valid Publish and confirmed Unpublish requests SHALL be represented as background jobs and executed one at a time in request order. A request received while another publication job executes SHALL remain visibly queued instead of failing only because publication work is active. Queued and running publication jobs SHALL pin their requested project, publisher, slug and operation, SHALL disable duplicate publication actions for that project, and SHALL remain observable after a page reload. The affected project's sidebar badge SHALL replace its remote publication state with the active local job state: queued SHALL use the same yellow treatment as queued Activity jobs, running SHALL use the same blue treatment and animated dot as running Activity jobs, and an idle published project SHALL use the same green treatment as completed Activity jobs. Existing safety conflicts with web or package work on the same project SHALL remain enforced.

#### Scenario: Two publication requests
- **WHEN** a developer requests publication work for a second app while another app's Publish or Unpublish job is running
- **THEN** the second request returns an accepted queued job, its project sidebar badge shows yellow `queued`, and it starts after the first operation ends

#### Scenario: Strict request order
- **WHEN** several Publish and Unpublish requests are accepted while publication work is active
- **THEN** at most one publication operation runs and queued operations start in their original request order, including after an earlier operation fails

#### Scenario: Running publication sidebar state
- **WHEN** a queued publication begins executing
- **THEN** its project sidebar badge changes to blue `running` with the shared animated status dot while Activity shows the same running state

#### Scenario: Publication completion sidebar state
- **WHEN** Publish succeeds, Unpublish succeeds, or either operation fails
- **THEN** the active job badge is removed in the completion update without waiting for remote publisher polling, and the sidebar shows green `published` only when the effective publication state remains published

#### Scenario: Queued job after reload
- **WHEN** the panel page reloads while a publication job is queued
- **THEN** Activity and the affected project's Build card restore its queued operation, the project sidebar restores its yellow `queued` badge, and Publisher, Slug and the publication action remain disabled

#### Scenario: Running job after reload
- **WHEN** the panel page reloads while a publication job is running
- **THEN** Activity, the Build card and the project sidebar restore that operation, including the blue running badge and animated dot

#### Scenario: Unsafe same-project work
- **WHEN** web or package work is running for a project, or that project already has queued publication work
- **THEN** the panel refuses a new operation that would race the same build output rather than allowing it to overtake the queue

#### Scenario: Queued Publish prepares current output
- **WHEN** a Publish job waits in the queue and later begins execution
- **THEN** it rebuilds or revalidates the app as needed, finalizes the current project icon as the browser favicon and calls the publisher only with the verified output
