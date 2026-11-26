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

The global Hands profile stores `postprocessing: {version:1, selected:null | {owner,id}, settings:{...}}`. Selection is None or one plugin, workspace-global, applied on the next desktop run. Per-plugin schema-versioned values remain when another plugin or None is selected. Mesh Save uses the existing profile lock/revision/atomic writer, preserves source/adjustments/unknown fields, and checks the current catalog revision. Missing saved plugins remain identifiable rather than being replaced. The section is bounded to 8 KiB within the existing profile bound.

Declaration/discovery, profile persistence, optional desktop-run supervision and standard SDK mesh drawing are implemented. Rebuild the host and SDK-consuming apps to use run-only mesh metadata; older bundles keep skeleton input with mesh rebuild/relaunch guidance. Standard drawing automatically consumes valid final-pose mesh output, uses the global bone color and opacity, and respects `handVisual:false`. Installing a declaration alone does not add a mesh: an explicitly selected, provisioned sidecar is needed. The Hands selector mount is pending integration.

See [the sidecar protocol](hand-mesh-protocol.md) for packet layout, bounded lifecycle, two-hand capacity and mandatory owner-loss cleanup. Missing/late/failed output visibly returns to the skeleton without delaying or changing interaction. Browser previews, published web builds and offline packages remain unaffected. No processor or model ships with this foundation.
