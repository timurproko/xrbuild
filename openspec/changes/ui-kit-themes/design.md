# Design

## Context

See proposal.md for motivation. The starting revision is `c70504822cafee5caa7f9e603cd1f8299399650a`, also the inspected remote default head.

- `default-visuals.ts` builds Button, Switch, individual Segmented caps, Slider and Dial. Segmented's well and Slider's dynamic fill geometry still live in controls; per-frame colours are hard-coded there.
- Dialog and Trackball have private visual builders. Dialog owns a Close Button and a sheet-frame blocker; Trackball rotates a stable object using the SDK and owns animated rings and a dotted shell.
- Label, Icon and GlassEdge construct their own graphics. Board currently lives inside the optional React adapters.
- `VisualResources` captures construction-owned resources and tracks Slider fill replacements. A theme switch needs a shorter visual lifetime, not disposal of the control/targets or caller-added children.
- React adapters construct once per SDK app and currently treat constructor options as stable. UI Kit and Launcher have pure scene exports and separate run entries; Launcher imports controls from UI Kit's public app barrel. The SDK owns timing, picking, hands and all mono/stereo draws.
- Existing `app-components` requirements forbid appearance changes from the previous migration. The delta explicitly retains that guarantee for the default theme and permits only requested alternate visuals, not behavioral changes.

## Goals / Non-Goals

**Goals:** One complete mesh-style contract, two complete implementations, app-local controlled selection, stable behavior through runtime switches, and strict default-picture preservation.

**Non-Goals:** Generic skin plugins, arbitrary layout systems, new input or render ownership, settings discovery/storage, query-string theme policy, control-panel integration or any visible selector. No scene/template/sample redesign and no replacement of standalone app icons.

## Decisions

### 1. Theme visual roles, never input behavior

Introduce immutable `UiKitTheme` definitions with stable built-in IDs `default` and `chamfer`, and a resolver accepting a built-in ID or a complete definition. A complete custom definition can be passed directly; do not introduce mutable global theme installation. Unknown IDs/incomplete definitions fail before retiring live visuals rather than silently blending skins.

The contract covers Board; Button pill/round and text/icon content; Switch; Segmented well/caps including latched/momentary/reselection behavior variants; continuous/stepped Slider including dynamic fill/ticks; Dial; Trackball model/shell/axis rings; Dialog sheet/film/edge/heading/body/Close; Label; Icon; GlassEdge; control title/status and touch-cursor appearance. Behaviour variants reuse visuals where their shape is identical, but must all be exercised.

Factories receive readonly visual dimensions and named layout anchors from the control, plus explicit consumer visual overrides. They return owned visual nodes, the necessary movable/material roles, and styling parameters for existing state animation. Geometry builders include dynamic geometry such as slider fill, not just constructor-time meshes. Theme defaults supply palette/state colours, material properties, text parameters and icon/edge styling. No factory registers targets, listeners, timers, sounds or frame loops. Keep role types narrow and usable by both built-ins; do not require an entire control subclass per theme.

Controls retain their numeric bounds, poke top/travel, pinch positions, volume radius, easing/timing, state machines and SDK arbitration. Themes receive those facts but cannot change them. Mesh thickness/bevels/recesses can differ inside the original envelope with the same visible contact plane and moving anchors. Titles/status baselines, text allocation, app transforms and total control footprints do not move. Theme typography cannot create wrapping, overlaps or layout reflow. Explicit caller text/icon/material options continue to override theme defaults.

**Alternative rejected:** A palette-only theme cannot satisfy the request. A global mutable style would bleed between consuming apps. Full control replacements would duplicate interaction behavior and invalidate capture parity.

### 2. Extract Default mechanically

Move the remaining private/default visual construction into the default theme without geometry optimization or cleanup that changes rendering. Preserve constructor order, coordinates, tessellation, bevel parameters, text canvas/font metrics, colours, emissive behavior, transparency/transmission, shader formulas, render order and lighting. Legacy `COLORS`, material/geometry helper exports and constructor signatures remain usable; existing callers with no theme select Default. The imperative entry remains React-free.

Board becomes available to the same non-React visual-selection path as the other primitives by moving its small owned object out of the React-only adapter. Positional constructors gain only optional trailing theme options; option-object constructors gain an optional theme. All themed objects expose `setTheme(selection)`; React invokes it rather than reconstructing a control on context updates.

**Alternative rejected:** Rewriting/normalizing the existing geometry while extracting it would make exact default-picture attribution unnecessarily difficult.

### 3. Chamfer is a complete coherent mesh style

Keep the existing graphite surroundings, ivory controls and restrained blue state accents. Change profiles, face construction and material response, not layout. Use crisp single bevels, clipped-corner rectangles and shallow stepped/inset faces with satin, less glossy materials. Preserve readable active/disabled feedback and the full original interaction envelope.

| Role | Chamfer treatment within the existing bounds |
| --- | --- |
| Board | Clipped-corner graphite slab, narrow bevel and recessed inner face instead of the rounded slab; same outer dimensions and mounting plane. |
| Pill Button | Elongated clipped-corner cap over a stepped well, satin ivory face and narrow bevel instead of semicircular ends. |
| Round Button | Faceted circular cap and matching recessed collar, with a thin inset face; pictogram remains centred and legible. |
| Switch | Clipped-corner channel with a faceted puck and inset face; identical lateral throw and front contact depth. |
| Segmented | Clipped-corner shared well with individually bevelled key faces and narrow inset outlines; both latched and momentary press paths remain unchanged. |
| Continuous Slider | Recessed straight channel, bevelled fill strip and clipped-corner handle with a single inset grip slot rather than raised triple ridges. |
| Stepped Slider | Same handle/channel profile, squared recessed detent marks replacing round dots; unchanged step positions. |
| Dial | Faceted rotary body, stepped collar, narrow engraved pointer and rectangular radial ticks instead of round tick dots. |
| Trackball | Same recognisable robot subject and silhouette envelope, with a chamfered head/inset sockets and satin faces; faceted axis hoops and a coarser, crisply defined shell pattern retain volume/axis cues. |
| Dialog | Clipped-corner frosted sheet with a stepped rim and lower-gloss film; heading/body anchors, lift, blocker and internally themed Close stay fixed. Launcher cards use this same sheet style. |
| Label/title/status | Same allocated text bounds, alignment, line spacing and baseline; restrained theme-owned weight/ink choices fitting those bounds, no new text or wrapping. The plane remains suitable for stereo text. |
| Icon | Same source pictogram and allocated size with crisper squared stroke joins/ends and theme-owned stroke weight; no new glyph or action. |
| GlassEdge | Thin clipped-corner edge profile matching the sheet, instead of the rounded soft rim; retain per-eye response and opacity animation. |
| Touch cue | Restrained faceted ring inside the current cue footprint; same fingertip location and proximity response. |

No new labels, badges, buttons, furniture outside control bounds or app decorations. Existing Launcher-specific branding, icons, spinners, catalog content and scene lights are not rethemed. Standalone app icons keep their existing subject/output.

**Alternative rejected:** A wholly different light/dark environment would become an app redesign. Merely lowering mesh segment counts across the kit would not provide coherent new face/proportion/material design.

### 4. Replace visual ownership, retain interaction identity

Separate permanent control hosts/targets from replaceable theme-owned visual resources. Stage the new visual bundle, bind its roles and apply the current state before committing the swap; on failure dispose the staged bundle and keep the old one live. Retire only the old bundle after successful replacement. Re-selecting the same immutable theme is a no-op.

Stable moving groups retain Button/Segmented press pose, Switch throw, Slider position/value, Dial rotation, Trackball quaternion/velocity/axis/totals and Dialog open/lift animation. In particular, keep the Trackball SDK rotation object and Dialog blocker sheet frame stable; replace their visual descendants rather than their target frames. Keep Close Button identity, callbacks and registrations stable while applying the inherited theme once. Preserve compact/enabled/visible state, explicit overrides, borrowed texture maps, caller-added children and caller customizations to the permanent control hosts. Construction-time mesh customization remains construction-time; no promise is made that a replaced owned mesh keeps arbitrary mutations.

An ordinary theme change does not detach targets, emit events, reset counters/values, re-run `configure`, restart catalog polling/navigation or re-mount app scenes. Held mouse presses, hand pokes, pinch drags and trackball grabs continue against the same target. Only existing disable/unmount paths cancel capture, without synthetic activation. Resource bundles own newly created geometry/materials/textures and per-eye edge caches, never the renderer or borrowed inputs. Shared nested ownership is explicit so dialog/Close resources retire once, not twice. Dynamic fill replacement joins the current bundle and retired resources are never updated again.

**Alternative rejected:** Keying/remounting controls on provider change is simpler but destroys live state and can break Launcher's delayed release/navigation. Mutating only material colours cannot replace geometry.

### 5. Minimal declared app selection seam

Proposed public API:

```tsx
// UI Kit optional React export, also re-exported by the UI Kit app barrel.
<UiKitThemeProvider theme="chamfer"><LauncherScene /></UiKitThemeProvider>
<LauncherScene theme="chamfer" />

// Side-effect-free declaration in each app's small theme module/public export.
export const uiKitTheme = { defaultTheme: 'default' } as const;

// The same scene boundary used by the runnable app and reusable scene.
<UiKitThemeProvider theme={theme} defaultTheme={uiKitTheme.defaultTheme}>
  {/* existing scene content, never keyed by theme */}
</UiKitThemeProvider>
```

`theme` is a controlled ID/definition; `defaultTheme` is a fallback, not settings metadata. Resolution is explicit control override, nearest explicit provider/scene theme, inherited provider value, per-app declared fallback, then library Default. Expose the resolved theme through a hook for consumers that need themed primitive defaults. Changing or removing an override re-resolves in place. Nested consumers and simultaneous scenes remain isolated; an app fallback must not mask an explicit surrounding provider.

Each app exports its typed scene props and `uiKitTheme` declaration without importing the run entry. Run entries use the same scene/default seam on initial mount and HMR updates. Tests and external consumers run both app scenes using the prop/provider; no URL switch, visible control, ambient window variable, persistence or control-panel change is introduced. The next task can read the serializable default ID and drive this controlled boundary from settings without changing control/theming internals.

Imperative callers pass `{ theme: 'chamfer' }` at construction and call `setTheme` at runtime; no provider or React dependency is required. Existing constructor forms stay valid.

**Alternative rejected:** Exposed-settings manifest/schema work belongs to the next task. Per-app CSS/document theme attributes are inappropriate for SDK-rendered meshes and independent composed app subtrees.

### 6. Verification is a full style/state and input matrix

Use targeted existing package/app fixtures, not the full local suite. Extend them with:

- Contract completeness, unknown/incomplete selection failure without destructive swap, actual geometry/profile differences, unchanged target definitions and bounded meshes/text; include all primitives and behavior variants.
- Both built-ins across pill/round, text/icon Button, Switch on/off, all Segmented options/latch/reselection modes, continuous/stepped Slider, Dial, Trackball free/X/Y/Z and Dialog/Close/blocking. Assert ordered events, sources, values, thresholds, capture/release, cancellation, animation progress and sound triggers against the same fixed-clock traces.
- Mouse and SDK-sampled hand-only input with native Mouse disabled, plus physical/emulated overlap and off-centre stereo hands, in perspective, orthographic and full stereo. Use actual SDK projection/input paths; changing a test-name string is not projection coverage. Require expected positive activations so equal empty traces cannot pass.
- Runtime switches at rest, hover, held poke, pinch drag, rotation and open dialog; disabled/compact/hidden objects; repeated Default/Chamfer cycles, two independent providers, callback changes, StrictMode, HMR/unmount and final disposal. Assert stable targets/control identity, once-only nested updates, bounded resource/registration counts and borrowed resources surviving.
- UI Kit and Launcher pure imports, cold source-alias consumer builds, relative production routes and icons. Retain Launcher's catalog reconciliation, accepted-navigation deadline, page/swipe/tilt and URL contracts through switching.

Capture a fresh baseline from the starting default-branch revision, not from the prior stage's pre-React baseline. Adapt the prior stage's fixed-clock build/browser replay method and its proof-only no-MSAA context pinning. Freeze viewport 800x450, DPR 1, cameras/frusta, assets/catalog, clocks and frame deltas identically. Keep product renderer options unchanged. Require PNG byte equality for every deterministic Default view/state against that baseline, including repeated no-MSAA pairs; do not substitute a numeric tolerance for deterministic results. For product-MSAA views, retain repeated unchanged-render diagnostics and disclose nondeterminism separately; do not claim byte equality where it is absent or let diagnostics excuse a deterministic mismatch.

Save Chamfer pictures of every primitive/control/variant and applicable rest, hover, pressed/held, changed/selected, disabled and dialog open/closed states, plus full UI Kit and Launcher scenes in all three views. Include both stereo eyes, Launcher loading/empty/error/populated/paged/tilted/launch states and reveal keyframes. Use proof-only fixtures for isolated controls, never extra product UI. Save semantic interaction traces and exact equality results between themes separately from intentionally different pictures. Record file/hash inventory, matrix coverage and an index for the maintainer. Store all images/builds/scripts/logs in the assigned task evidence folder outside the checkout; publish no machine-specific paths in product documentation. Physical hardware acceptance is separate and is not inferred from browser replay.

## Risks / Trade-offs

- [Hard-coded per-frame colours or dynamic fill accidentally escape the contract] → Route every visual state role through the selected theme and test active/disabled states, not only constructor snapshots.
- [Visual profile diverges from the invisible target] → Preserve contact planes/anchors and test bounds plus hand poke/pinch traces; bevels and inset decoration stay within fixed envelopes.
- [Trackball or dialog swap interrupts capture] → Stable SDK rotation/blocker/Close frames with visual-only replacement and held-switch regressions.
- [Nested or shared resource retirement becomes double disposal] → Explicit owned bundles and disposal counters across repeated switches, with borrowed textures/children checked separately.
- [Theme typography increases text width] → Keep the reference allocation and line metrics; bound theme defaults and retain explicit caller overrides; reject overflow in fixtures.
- [Renderer antialias noise is misreported as a pass] → Deterministic byte gate uses the identical no-MSAA proof harness on both builds, with unchanged product defaults and separate repeat-noise records.
- [Selection grows into the next settings feature] → Only stable IDs, a plain app default declaration and controlled prop/provider now; no discovery, persistence or panel schema.

## Migration Plan

Existing apps and imperative callers require no edits: omitted theme remains Default. Add theme contracts/default extraction first, then Chamfer, switching/provider, app wiring and documentation in the ordered outcomes. Keep assertions and snapshots tied to the starting default revision. If Default fails its deterministic image gate or either style fails interaction parity, fix the implementation rather than changing reference output or targets. Rollback is removal of the new opt-in surface; no stored user data or manifest migration is needed.
