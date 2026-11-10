## ADDED Requirements

### Requirement: Simplified project context menu
The project-row context menu SHALL NOT offer Review build cache, and the Apps UI SHALL NOT expose its build-cache review modal. Delete SHALL be hidden for embedded projects in Projects and Archive rather than shown disabled. Ordinary idle project deletion and existing active-use restrictions SHALL remain unchanged. Switching between project menus SHALL NOT retain embedded-only disabled state or tooltips.

#### Scenario: Embedded project menu
- **WHEN** the user opens the context menu for an embedded project in Projects or Archive
- **THEN** neither Review build cache nor Delete is offered, and other supported actions retain their normal behavior

#### Scenario: Ordinary project after embedded project
- **WHEN** the user opens an idle ordinary project's menu after opening an embedded project's menu
- **THEN** Delete is visible and enabled under its ordinary rules, without an embedded deletion tooltip, and Review build cache remains absent

#### Scenario: Running project menu
- **WHEN** the user opens the context menu for a running project
- **THEN** Delete remains hidden under the existing active-use restriction

### Requirement: UI simplification preserves backend safeguards
Removing project cache-review controls SHALL NOT remove cache-maintenance APIs, initiate cleanup or relax preservation checks. Server-side embedded deletion refusal SHALL remain authoritative and explanatory.

#### Scenario: Backend safety remains enforced
- **WHEN** a client directly requests embedded project deletion or cache maintenance
- **THEN** embedded deletion is refused with its existing explanation, and cache maintenance retains explicit review, confirmation and all preservation checks
