## ADDED Requirements

### Requirement: Queued publication operations
Valid Publish and confirmed Unpublish requests SHALL be represented as background jobs and executed one at a time in request order. A request received while another publication job executes SHALL remain visibly queued instead of failing only because publication work is active. Queued and running publication jobs SHALL pin their requested project, publisher, slug and operation, SHALL disable duplicate publication actions for that project, and SHALL remain observable after a page reload. Existing safety conflicts with web or package work on the same project SHALL remain enforced.

#### Scenario: Two publication requests
- **WHEN** a developer requests publication work for a second app while another app's Publish or Unpublish job is running
- **THEN** the second request returns an accepted queued job and starts after the first operation ends

#### Scenario: Strict request order
- **WHEN** several Publish and Unpublish requests are accepted while publication work is active
- **THEN** at most one publication operation runs and queued operations start in their original request order, including after an earlier operation fails

#### Scenario: Queued job after reload
- **WHEN** the panel page reloads while a publication job is queued
- **THEN** Activity and the affected project's Build card restore its queued operation and keep Publisher, Slug and the publication action disabled

#### Scenario: Unsafe same-project work
- **WHEN** web or package work is running for a project, or that project already has queued publication work
- **THEN** the panel refuses a new operation that would race the same build output rather than allowing it to overtake the queue

#### Scenario: Queued Publish prepares current output
- **WHEN** a Publish job waits in the queue and later begins execution
- **THEN** it rebuilds or revalidates the app as needed, finalizes the current project icon as the browser favicon and calls the publisher only with the verified output
