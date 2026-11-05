# Design

## Publication reveal

Keep the existing bounded optimistic publication status and enter/leave bookkeeping, but apply the shared design-system reveal transition to the complete publication history block. Publish reveals the divider and deployment item together; Unpublish retains the affected block long enough to collapse and fade it before removal. Only completion effects animate, so ordinary status refreshes do not replay motion and reduced-motion preferences remain immediate.

## Shared field errors

The design system will own one field-help/error presentation for text inputs, number inputs and custom dropdowns. Validation sets `aria-invalid`, but does not replace the normal surface with a red fill or suppress the active focus treatment. The helper line keeps the same size, weight and line height as descriptive copy and changes only to the semantic error color. Product code supplies messages and positioning but does not duplicate field-error visuals.

## Empty publication slug

An empty normalized slug means the publisher's route-prefix root. Core URL construction produces `/apps/` without a duplicate slash, manifest/API validation accepts the empty value, and the UI preserves an intentionally empty slug instead of restoring the project folder name.

The production publisher cannot treat the route-prefix folder like an ordinary child route because deleting `apps/` would remove every named app. Root publication therefore records the exact files it owns. Publish removes or replaces only the prior root-owned files, refuses collisions with child routes or unrelated content, and writes the root marker at `apps/.xrb-publication.json`. Unpublish removes only those recorded files and empty directories while retaining every `apps/<slug>/` deployment. Route moves between root and named paths use the same ownership rules, and rollback remains Git-based and publicly verified.

## Verification

Focused tests will cover shared input/dropdown error markup and styling, empty-slug normalization and URLs, safe root publish/republish/unpublish alongside named routes, collision refusal, rollback, and visible reveal/collapse transitions. Full Control Panel and production-publisher suites plus browser smoke will confirm the integrated behavior.
