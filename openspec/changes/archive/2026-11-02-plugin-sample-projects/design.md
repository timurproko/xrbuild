# Design

## Context

Plugins Manager currently exposes manifest identity, enablement and settings. A plugin may also register a
panel-managed tool, but there is no contract for plugin-owned project examples. The private workspace therefore keeps
one diagnostic as an ordinary project while the plugin's managed-tool module imports it by relative path. The running
managed tool can hold files in that project open, and the ordinary project lifecycle can move or delete source that
the installed plugin still requires.

Native providers are discovered from built binaries and every enabled provider becomes a role choice. Plugin metadata
can rename a provider for presentation, but cannot say that a diagnostic or unfinished provider should stay available
to explicit runtime configurations while remaining absent from normal choices.

## Goals / Non-Goals

**Goals:**
- Keep each original sample inside its installed plugin and present it in that plugin's details.
- Import a self-contained editable copy into the normal project inventory under `PLUGINS`.
- Make repeated imports safe through normal case-insensitive project-name collision handling.
- Keep diagnostic providers out of normal choices without disabling unrelated plugin features.
- Remove the managed-tool file lock from the user's imported project copy.

**Non-Goals:**
- Installing plugins or downloading samples from a remote catalog.
- Synchronizing an imported copy when the plugin's original sample changes.
- Turning a browser diagnostic pipeline into a native application input provider.
- Changing provider IDs, the plugin ABI or explicit host command-line selection.

## Decisions

### D1. Samples are declared by bounded plugin-relative metadata

`xrb-plugin.json` gains `panel.samples`, a bounded list of objects with a stable lower-case `id`, a relative `path`
and an optional short `description`. The source folder must resolve canonically inside the plugin, contain a valid
`xrb-project.json`, and use its project manifest for the displayed/default project name. Invalid sample entries are
reported with the plugin metadata problem and are never copied.

The declaration is metadata rather than directory convention so plugins can organize source freely and the panel does
not scan arbitrary plugin trees. A stable ID gives the import API a bounded identifier independent of display names.

### D2. Import creates an ordinary project in the `plugins` section

Plugins Manager opens the existing project-name dialog from a sample's Import action. The default is the sample
manifest name; the destination folder is derived with the same rules as New project. The server refuses a folder name
that collides case-insensitively with any live or archived project.

The importer copies regular source files into a staging folder, excludes dependency and generated-output directories,
rejects symbolic links and other special filesystem entries, rewrites the copied `xrb-project.json` name and the
copied package name when present, validates the result, and atomically renames the staging folder to
`projects/plugins/<folder>`. A failed import removes its staging folder and leaves the original untouched.

The physical section folder makes the imported copy appear under `PLUGINS` without a second ownership registry.
After success, the browser reloads projects, selects the imported project and returns to Control Panel. The copy then
uses the existing rename, build, run, archive and Recycle Bin delete behavior. Disabling or removing the plugin does
not remove an imported copy.

### D3. Original samples remain usable by plugin-managed tools

A plugin-managed tool may load modules from its own sample source. Imported copies are never used as tool source, so
user edits cannot change the installed tool and the tool cannot lock the imported project's directory. Installed
sample dependencies participate in the integration workspace's package graph; imported dependencies participate in
the selected project repository's existing readiness/install flow.

### D4. Provider visibility is presentation metadata

`xrb-plugin.json` gains `panel.hiddenProviders`, a bounded distinct list of native provider IDs owned by that plugin.
The panel excludes those providers from ordinary role choices while continuing to discover them for build freshness,
explicit manifests and host operation. This does not disable the plugin, its tools, samples or settings.

A project that already stores a hidden provider is not rewritten on load. The selector presents that saved value only
as unavailable so the user can remove or replace it; projects that do not already select it never see it as a choice.
Removing the metadata later makes the provider selectable again without changing its stable runtime ID.

### D5. The private diagnostic becomes the plugin's sample source

The private workspace moves the existing diagnostic tree beneath its owning plugin, updates the managed-tool module to
load that local source and includes plugin sample packages in the workspace package graph. The sample manifest no
longer selects the fixture provider. Plugin metadata declares the sample and hides the fixture provider, while the
separate camera-backed provider keeps its current identity and availability.

## Risks / Trade-offs

- [A sample contains generated or linked content] → Import skips known dependency/output folders and rejects links or
  special entries instead of following them outside the declared source.
- [Import fails after creating files] → The copy is built and validated in a unique staging folder, cleaned on error,
  then moved atomically into the project section.
- [A plugin update changes a sample] → Imported projects intentionally do not update; the plugin's original can be
  imported under another unique name for comparison.
- [A hidden provider remains in an old manifest] → The panel preserves it as unavailable rather than destroying
  configuration; the workspace migration removes the fixture selection from the moved sample.
- [An explicit project repository requires a lockfile update] → Import invalidates package readiness exactly like
  adding another project; mutable user workspaces refresh automatically, while versioned explicit repositories retain
  their existing frozen-lockfile discipline.

## Migration Plan

1. Add and test the generic plugin sample and hidden-provider contracts in the control panel.
2. Move the private diagnostic source into its plugin, update workspace package metadata and the managed-tool module,
   and declare the sample/hidden provider.
3. Remove the old ordinary diagnostic project path and verify the managed tool starts from plugin-owned source.
4. Import the sample through Plugins Manager and verify its copy appears under `PLUGINS`, runs independently, and can
   be archived and deleted while the original tool continues to work.

## Open Questions

None.
