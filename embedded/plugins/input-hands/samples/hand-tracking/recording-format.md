# Existing recording formats and playback

Hands Record retains existing file readers, original coordinates and basic playback. It does not re-run inference,
compare algorithms, reconstruct depth-hand surfaces or fuse cameras. New selected-provider recording is a separate
versioned raw-stream format; it is not written into legacy CSV/media schemas. See core `docs/hands.md`.

## Pose CSV v1

Files start with `# xrbuild-hand-tracking-csv v1`, followed by JSON metadata (`createdUtc`, `durationMs`, `frames`) and
columns `time_ms,space,hand_id,handedness,joint,x,y,z,valid`. Space is `hand-relative` or `camera-metric`; each hand has
21 joint slots and invalid joints remain null/invalid. This is not calibrated panel/app input. The old producers were
camera landmarks, RGB-D measured hand surfaces or two-view output—not the global skeleton provider.

Existing files remain in workspace `.xrb/hand-tracking/recordings/`. Read/list/export and playback do not require a
connected camera or a model. The storage API retains its 16 MiB limit, bounded names/inventory, contained regular-file
checks and same-origin writes. Opening Hands never writes or migrates them. Explicit Folder is the only folder-open
action. A malformed file is an error, not permission to replace it with defaults.

## RGB v1

`XRBHTRK1` contains a bounded manifest, frame metadata and PNG payloads. Validated legacy aliases remain accepted by
the original parser. The manifest retains source/runtime/model provenance, settings, page-time origin, mirrored-preview
state, original relative frame-ready times and usage declarations. Each frame preserves the PNG digest and original
model observation. It has no depth calibration or native optional gesture signals. Playback decodes saved pixels and
observations only, in hand-relative coordinates; it does not load the declared model or claim app input.

## RGB-D v2 and paired files

See [RGB-D/paired compatibility](depth-recording.md). Both independent camera streams remain readable without the
removed fusion/comparison engines. Existing native host `.hands` recordings are a different contract; these parsers
never reinterpret one as another format.

## Privacy, bounds and file ownership

Media containers retain the existing 128 MiB encoded, 600-frame and 20-second format bounds, per-frame validation,
checksums and cancellation. They remain private local evaluation data, not public app assets. Stored RGB may include
people/surroundings. No automatic upload, import, model download or data migration occurs. An imported file is kept
in memory and explicit Export returns its original bytes; browser download initiation is not proof of durable storage.
Closing a page can lose unsaved in-memory data. Existing user exports stay wherever saved; files/models/calibration
are never included in the public component/source build closure.
