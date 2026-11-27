# Optional hand mesh plugins

## Declaration foundation

Installed plugins may declare one optional `handMesh` in `xrb-plugin.json`. This is a geometry-only sidecar, not another skeleton provider. Discovery reads metadata and checks the contained program file; it does not import code, query a binary, start a process, create settings or download anything.

```json
{
  "title": "Example mesh",
  "type": "plugin",
  "version": "1.0.0",
  "handMesh": {
    "version": 1,
    "id": "surface",
    "label": "Example mesh",
    "program": "runtime/mesh-worker.exe",
    "args": [],
    "settingsVersion": 1,
    "settings": [
      {
        "key": "quality",
        "label": "Quality",
        "type": "select",
        "default": "mid",
        "options": [
          { "value": "low", "label": "Low" },
          { "value": "mid", "label": "Mid" }
        ]
      }
    ]
  }
}
```

Identity is the catalog's qualified owner plus the local ID, for example `workspace:example/surface`; a label is not an identity. Existing enabled/origin selection rules apply, including conflicts. A disabled, conflicting, missing or unsafe program remains unavailable; it never wins by scan order. The program must be a regular unlinked file inside its plugin source root. No absolute/traversing paths, junction/symlink escapes or hard links are accepted. There is no ambient executable search.

The declaration permits at most eight settings with boolean, finite bounded number, or select types. Every field requires a valid default; number fields require finite min/max and select fields have 1–16 distinct options. Values are bounded to 2 KiB, and unknown keys require schema review. Text/path/credential/command fields, skeleton outputs, stage order and bypass policies are not supported. Installed code is trusted: these checks are not a sandbox or permission to distribute assets.

The global Hands profile stores `postprocessing: {version:1, selected:null | {owner,id}, settings:{...}}`. Selection is None or one plugin, workspace-global. Compatible managed desktop runs follow committed changes through the run gateway; legacy peers retain supported launch-time behavior with relaunch guidance. Per-plugin schema-versioned values remain when another plugin or None is selected. Mesh Save uses the existing profile lock/revision/atomic writer, preserves source/adjustments/unknown fields, and checks the current catalog revision. Missing saved plugins remain identifiable rather than being replaced. The section is bounded to 8 KiB within the existing profile bound.

Declaration/discovery, profile persistence, optional desktop-run supervision and standard SDK mesh drawing are implemented. Rebuild the host and SDK-consuming apps to use run-only mesh metadata; older bundles keep skeleton input with mesh rebuild/relaunch guidance. Standard drawing automatically consumes valid final-pose mesh output, uses the global bone color and opacity, and respects `handVisual:false`. Installing a declaration alone does not add a mesh: an explicitly selected, provisioned sidecar is needed. The selector is mounted in the Hands page's dedicated slot below Source.

See [the sidecar protocol](hand-mesh-protocol.md) for packet layout, bounded lifecycle, two-hand capacity and mandatory owner-loss cleanup. Missing/late/failed output visibly returns to the skeleton without delaying or changing interaction. Browser previews, published web builds and offline packages remain unaffected. No processor or model ships with this mechanism.

## Prepared user-home runtimes (declaration v2)

Runtime/model files belong to the **user's** `~/.xrbuild/plugins/<runtime.id>/<runtime.generation>/`, never the selected workspace, `XRB_HOME`, or the plugin source tree. V2 may declare `runtime:{id:"surface-runtime",generation:"g1"}` with a relative `program` inside that generation. The default root is always `os.homedir()/.xrbuild`; only an injected `userRoot` in tests changes it. Discovery and resolution write nothing and never install/download/import/query a program.

An explicit external setup contribution can use `meshRuntimeReceipt(owner, generationRoot)` from `src/hand-mesh-runtime.ts` to construct data, then publish `.xrb-hand-mesh-runtime.json` after its own authorized provisioning. Core provides no installer here. The complete version-one receipt contains `status:"complete"`, qualified `owner`, local mesh `id`, canonical source `source`, source `inputs` SHA-256, parsed `declaration` SHA-256, and `files:[{file,bytes,sha256}]`. The helper computes the canonical inventory; provisioners must retain that order. Source fingerprints exclude root `.git`, `node_modules`, `build`, `bin` and `dist`; immutable runtime inventories exclude only the receipt. Keep writable caches outside the immutable generation.

Discovery reads a bounded receipt and checks the launch file. Launch revalidates source/declaration identity and every inventoried output, refuses unexpected files, checks regular unlinked files/ancestors again, and uses the generation as cwd. Stale/incomplete/foreign/missing/modified/linked state is unavailable with explicit preparation guidance, never PATH fallback. These checks are consistency boundaries for trusted installed code, not a sandbox against a malicious same-user writer. Resolved paths and launch closures stay server-private and out of portable output. Source-contained legacy programs remain supported.

## Hands component

`packages/control-panel/ui/hands-postprocessing.js` exports `mountHandsPostprocessing(root, {load, save, pollMs})` returning `refresh`, `reload` and `dispose`. Defaults use `GET/PUT /api/hands/postprocessing`; the component owns its root queries, fields, drafts and status polling. It preserves source/adjustment drafts, reports stale revisions without overwriting state, and can be reparented unchanged. `hands.js` mounts it once into the Hands page's `#hands-postprocessing-root` and calls `dispose` at page teardown. The component replaces the slot placeholder without changing the surrounding page layout.

The selector offers None or installed plugins, keeps missing saved identity visible, and renders at most eight validated fields beneath it. Save persists selection/settings independently and compatible running desktop apps update asynchronously; legacy consumers receive relaunch guidance. Current-run status identifies processor application separately from saved values and drawing. While Save is pending, the selector, setting fields and numeric stepper buttons are disabled and busy input events are ignored. The submitted values are snapshotted; controls unlock after completion and later edits become new unsaved drafts. The one-line context notice explicitly says previews, published web builds and offline packages do not use post-processing. Navigation and status polling never start the sidecar.
