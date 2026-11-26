# Hands adjustments

Hands owns one profile at `<workspace>/config/hands/profile.json`, shared with the source picker, not a provider's calibration or an app's settings. Opening Hands writes nothing and starts no tracking. Existing source-only records inherit identity geometry and the exact standard SDK look without migration.

Position is panel-space millimetres: X right, Y up, Z toward the viewer; each -150..150, default 0. Size is uniform .5..1.5, default 1, about each hand's own wrist. It changes where the hand touches.

Appearance is drawing only: joints/bones on by default, diameters 15 mm (bounds 1..40 / 1..30); linear colours [0,.541,1] / [0,.482,1]; skeleton opacity .333. The pinch-or-grab indicator defaults to on, 30 mm (1..60), white [1,1,1], opacity .9. Opacities/linear colour components are 0..1; visibility values are booleans. Colour pickers display sRGB but untouched colours retain their precise stored linear components.

Invalid types, non-finite or out-of-range values are rejected with a field-specific reason. Invalid/foreign/linked/oversized records are not silently reset. Source Save and adjustment Apply use the same file revision and exclusive atomic writer; a stale editor must reload/review instead of overwriting another edit. Unknown fields are preserved. Applying adjustments never changes an existing source choice or its calibration.

Position and size and Appearance are independent, relocatable control sections, not part of the source card. Reset changes only that group's draft; explicit Apply saves both adjustment groups. Source Save is separate and applies on next launch. The live hand view and future plugin processing-stage layout are separate work.
