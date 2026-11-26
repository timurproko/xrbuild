# RGB-D v2 and paired recording compatibility

Existing files remain readable in Hands Record without camera acquisition, inference, surface reconstruction, fusion
or benchmark/comparison workflows. Those removed laboratory views are not restored by importing a recording.

## RGB-D v2

`XRBHTRK2` preserves the bounded manifest and compressed original native RGB8, depth Z16 and aligned-depth packets.
It records exact source serial/profile/intrinsics/extrinsics/depth-scale calibration, run/frame/clock metadata,
page receive/completion timing, optional original observations and sampling settings. The decoder verifies packet
hashes, plane sizes, profile/source identity, provenance and decompressed-size limits before use. Legacy format aliases
remain accepted by the original validators. Imported model names are provenance, never instructions to load a model.

Playback exposes the saved RGB/depth pixels and original hand-relative observations when present. A depth-only file
has pixels but no invented skeleton. Recorded sampling settings remain readable metadata; playback does not recompute
measured hand surfaces or advertise camera-metric accuracy. Pose CSV files that already store camera-metric XYZ retain
those stored points separately, without a second transform or conversion to app input.

## Paired files

`XRBPAIR1` contains two nested validated RGB-D streams with different camera serials and a shared page-clock origin.
The existing combined 128 MiB / 600-frame / 20-second bounds remain. Hands exposes Camera A and Camera B independently
with their original frame times and packets; no matching, temporal qualification, fusion, annotation or A/B scoring
is inferred from the container. The manifest's `exposureSyncVerified:false` stays false.

## Storage and privacy

These clips were bounded in-memory captures until explicit export. Existing exported `.handtracking`, legacy aliases
and `.handpair` files remain wherever saved; there is no automatic move or migration. Import validates before adoption,
never opens a camera and never starts a runtime. Export returns the original file bytes. See the shared
[recording/privacy contract](recording-format.md). Software codec tests are not physical capture or calibration evidence.
