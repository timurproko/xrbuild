# Proposal

## Why

Applications currently select concrete hand-input plugins, while the Hands view is an optional synthetic-data diagnostic. Hand should instead be one input kind, with its source selected once in Hands for all applications and a shared pipeline that can later support real-hand configuration and testing.

## What Changes

- Offer Mouse, Keyboard and logical Hand in the application Input selector; move concrete skeleton-source selection to Hands.
- Add a bounded, origin-aware provider registry over the existing native input ABI and core WebXR adapter, without changing binary layouts, tracking algorithms or native gesture semantics.
- Store one global provider selection in the selected user workspace, initially defaulting to exactly one installed enabled real source when no choice exists; expose availability without starting capture and never replace a saved choice silently.
- Make the core-owned Hands entry a source-configuration surface with a provider picker and availability state. Retain optional acquisition diagnostics separately; do not present synthetic fixtures as the selected real hand.
- Resolve Hand consistently before native/dev launch, browser preview and checked packaging/publication. Read all old concrete-provider inputs as Hand, including multiple providers; launch the global source and write canonical inputs on the next settings Save, never on read.
- Establish one identity-by-default shared ingress seam for future processing layers; implement no processing plugins or laboratory in this change.

## Capabilities

### New Capabilities

- `hand-input`: Provider declarations, global selection, source availability, compatibility migration and context-specific runtime resolution.
- `hands-module`: Core-owned provider configuration and its passive lifecycle, independent of optional diagnostic providers.

### Modified Capabilities

None. The trusted-launcher-return requirement remains unchanged.

## Impact

Panel plugin/catalog validation, project input presentation, workspace state/API, run-settings and embedded working-state handling, host launch preparation, packager selection closure, SDK native/WebXR ingress and navigation context, and the existing embedded diagnostic route declaration. No C ABI or HANDS wire/recording layout changes; no device or tracking-runtime work. Concrete private integrations need a separate metadata-only declaration in their owning repository; no private source or source inventory belongs in this public change. Implementation is approved with simple global normalization; old per-app provider parity, explicit adoption and input-semantics versions are excluded.
