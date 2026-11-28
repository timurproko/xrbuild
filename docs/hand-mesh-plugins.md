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

The global Hands profile stores `postprocessing: {version:1, selected:null | {owner,id}, settings:{...}}`. Selection is None or one plugin, workspace-global. Compatible managed desktop runs follow committed changes through the run gateway; legacy peers retain supported launch-time behavior with relaunch guidance. Per-plugin schema-versioned values remain when another plugin or None is selected. Mesh preference writes use the existing profile lock/revision/atomic writer, preserves source/adjustments/unknown fields, and checks the current catalog revision. Missing saved plugins remain identifiable rather than being replaced. The section is bounded to 8 KiB within the existing profile bound.

Declaration/discovery, profile persistence, optional desktop-run supervision and standard SDK mesh drawing are implemented. Rebuild the host and SDK-consuming apps to use run-only mesh metadata; older bundles keep skeleton input with mesh rebuild/relaunch guidance. Standard drawing automatically consumes valid final-pose mesh output, uses global bone colour with opaque single-sided lit skin independent of skeleton opacity, and respects `handVisual:false`. Hands live sessions use the same SDK visual and [bounded current-wrist compensation](hand-mesh-motion.md). Installing a declaration alone does not add a mesh: an explicitly selected, provisioned sidecar is needed. The selector is mounted in the Hands page's dedicated slot below Source.

See [the sidecar protocol](hand-mesh-protocol.md) for packet layout, bounded lifecycle, two-hand capacity and mandatory owner-loss cleanup. Missing/late/failed output visibly returns to the skeleton without delaying or changing interaction. Browser previews, published web builds and offline packages remain unaffected. No processor or model ships with this mechanism.

## Modern declaration example

```json
{
  "version": 2,
  "id": "surface",
  "label": "Example surface",
  "program": "bin/worker.exe",
  "args": [],
  "runtime": { "id": "surface-runtime", "generation": "g1" },
  "capabilities": ["final-pose-observations-v1", "live-configure-v1", "preparation-progress-v1"],
  "preparationTimeoutMs": 60000,
  "settingsVersion": 1,
  "settings": [
    { "key": "quality", "label": "Quality", "type": "select", "default": "detailed", "changeMode": "live",
      "options": [{ "value": "standard", "label": "Standard" }, { "value": "detailed", "label": "Detailed" }] },
    { "key": "device", "label": "Execution device", "type": "select", "default": "cpu", "changeMode": "reprepare",
      "options": [{ "value": "cpu", "label": "CPU" }, { "value": "gpu", "label": "GPU" }] }
  ]
}
```

This is the `handMesh` member, not a complete plugin manifest. Values/labels/available devices belong to the plugin; core does not discover a GPU or install anything. A capability omitted by the declaration is not sent as an optional frame extension. See the protocol for exact ready/configure/ACK/progress fields.

## Prepared user-home runtimes (declaration v2)

Runtime/model files belong to the **user's** `~/.xrbuild/plugins/<runtime.id>/<runtime.generation>/`, never the selected workspace, `XRB_HOME`, or the plugin source tree. V2 may declare `runtime:{id:"surface-runtime",generation:"g1"}` with a relative `program` inside that generation. The default root is always `os.homedir()/.xrbuild`; only an injected `userRoot` in tests changes it. Discovery and resolution write nothing and never install/download/import/query a program.

An explicit external setup contribution can use `meshRuntimeReceipt(owner, generationRoot)` from `src/hand-mesh-runtime.ts` to construct data, then publish `.xrb-hand-mesh-runtime.json` after its own authorized provisioning. Core provides no installer here. The complete version-one receipt contains `status:"complete"`, qualified `owner`, local mesh `id`, canonical source `source`, source `inputs` SHA-256, parsed `declaration` SHA-256, and `files:[{file,bytes,sha256}]`. The helper computes the canonical inventory; provisioners must retain that order. Source fingerprints exclude root `.git`, `node_modules`, `build`, `bin` and `dist`; immutable runtime inventories exclude only the receipt. Keep writable caches outside the immutable generation.

Discovery reads a bounded receipt and checks the launch file. Launch revalidates source/declaration identity and every inventoried output, refuses unexpected files, checks regular unlinked files/ancestors again, and uses the generation as cwd. Stale/incomplete/foreign/missing/modified/linked state is unavailable with explicit preparation guidance, never PATH fallback. These checks are consistency boundaries for trusted installed code, not a sandbox against a malicious same-user writer. Resolved paths and launch closures stay server-private and out of portable output. Source-contained legacy programs remain supported. Prepared runtime and source trees must be disjoint; use a distinct runtime ID when source is itself installed beneath the user's plugins directory, avoiding source/receipt self-inclusion.

## Setup export (`mesh-runtime-setup`)

A hand mesh plugin whose runtime is installed separately can export `mesh-runtime-setup`. The Hands Post-process tab then shows
**Prerequisite** and **Install** on its layer while the runtime is missing, or was prepared for another version of the
plugin source, and runs the setup as a panel job that Restart waits for. While the layer waits for Install, only Install
and the setting that asks for an optional runtime stay active.

The module exports:

- `plan()`: what would be downloaded, without downloading. Returns `consent`, `destination`, `downloadBytes`,
  `installedBytes`, `licences` and `items` (`name`, `version`, `publisher`, `licence`, `bytes`). The dialog shows sizes and
  licences, never URLs. Optional fields:
  - `input: { label, accept }`: one local file the person must choose, such as a licensed archive that cannot be
    downloaded (`accept` is a comma list like `.zip`). The dialog shows a file picker; the panel copies the file to
    `~/.xrbuild/setup-inputs/` for this install only and passes its path as `install({ from })`.
  - `python`: core's shared Python, declared in the manifest (below). `true` asks for a reusable environment and
    `install` receives `python` as its `python.exe`; `{ into: 'runtime', set?, interpreter? }` places Python inside the
    plugin's runtime folder and `install` receives `python.install(dest, { findLinks? })`.
- `status()` (optional): `{ cpu: { installed } }`, so the dialog can say the runtime is already installed.
- `install({ consent, core, workspace, owner, onProgress, from?, python? })`: installs the exact plan the person accepted.
- `refresh({ core, workspace, owner })` (optional): after a plugin source update, re-checks an installed runtime and
  writes a new receipt without downloading. Install calls it instead of `install` while the runtime is installed.

### Shared Python (`python` in xrb-plugin.json)

A plugin that needs Python declares it instead of shipping an installer for it:

```json
"python": {
  "version": "3.12.12",
  "wheels": [{ "name": "numpy", "version": "2.2.6", "sha256": "<64 hex>", "bytes": 12614190, "publisher": "NumPy (PyPI)", "licence": "BSD-3-Clause" }],
  "sets": { "gpu": { "index": "https://download.example/whl", "wheels": [] } }
}
```

Versions are exact and every wheel is pinned by SHA-256; `sets` are optional named groups with an optional https index.
Core downloads one pinned uv (checked by size and SHA-256) into `~/.xrbuild/python`, installs the exact standalone CPython,
and installs only the listed wheels with `--require-hashes --no-deps --only-binary :all:`. It never uses a Python or uv
already on the machine and changes neither PATH nor the registry. Whatever is not ready yet joins the Install plan and its
consent. A reusable environment lives in `~/.xrbuild/python/envs/`; a runtime placement copies the interpreter into the
plugin's runtime folder with a `._pth` file and installs the set into its `site-packages`, so the plugin's receipt covers
every file that runs.

### Progress

Every setup reports progress the same way, and core formats it, so no plugin needs its own wording. Call `onProgress`
with:

| Field | Meaning |
| --- | --- |
| `step` | Short lowercase name such as `download`, `unpack`, `self-check` (`[a-z][a-z0-9-]*`, up to 32 characters). |
| `done`, `total` | Both present for a measurable step. |
| `unit` | `bytes` (default) or `items`. |
| `detail` | The current item, for example a module name; single line, up to 80 characters. |

Core logs `download: 1.0 MB of 2.0 MB (50%)`, `self-check: 3 of 7 (42%) · torch` or `unpack…`, and the dialog shows the
step with its percent, or how long it has run when there is no total. Malformed events are ignored. Report each item of
a long step, such as each module a self-check imports, so the person can see it is still working.

## Hands component

`packages/control-panel/ui/hands-postprocessing.js` exports `mountHandsPostprocessing(root, {load, save, retry, pollMs})` returning `refresh`, `reload` and `dispose`. Defaults use `GET/PUT /api/hands/postprocessing` and `POST /api/hands/postprocessing/retry`. The component owns its root queries, local drafts, serialized writes and status polling; `reload` is a programmatic recovery hook, not a routine UI button. `hands.js` mounts it once into `#hands-postprocessing-root` and calls `dispose` at page teardown. The component can be reparented without changing the surrounding page or source/adjustment drafts.

The selector offers None or installed plugins, retains missing saved identity and is hidden only when no plugin is installed. It renders at most eight declared settings as paired number/slider rows, dropdowns and switches. Valid finished edits, selection and section Reset to defaults save immediately without Save/Reload. Intermediate input stays local, including browser-held incomplete numeric text across status polls and unrelated save completions. Reset changes only the current plugin's declared settings, not its selection or other profile sections.

Controls remain editable during writes. Submitted values are snapshotted; newer completed intentions queue and are removed only when their own versions are saved. Completed settings for a previous plugin drain before the final queued None/other-plugin selection. Fresh profile/catalog revisions and field-wise conflict checks preserve unrelated edits; same-field/schema conflicts show the saved value and require explicit Retry or Use saved. Busy, validation and transport failures retain drafts rather than automatically looping.

Compatible active consumers update asynchronously. Applied requires matching run/plugin identity, saved revision and requested/applied configuration generation; saving or an older acknowledgement never proves application or drawing. Preparing shows available progress; delivery failure retains preferences and offers Retry bound to the current `{runId, revision}` without another profile write. Legacy consumers receive relaunch guidance. The one-line context notice excludes browser previews, published web builds and offline packages. Navigation, polling and idle saves never start capture, installation or a sidecar.
