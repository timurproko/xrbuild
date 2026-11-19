# Embedded hand implementation

- Provider ID `hand-tracking`; public native ABI only, no other input-plugin dependency or plugin-specific engine branch.
- Native application provider remains synthetic. Export/relocation approval does not authorize cameras, ML/device runtime startup or advancing physical stages. Default validation uses authored fixtures and mocks only.
- Keep implementation, diagnostic/sample, tests and build descriptors here. Never write source/bin/build/vendor assets, configuration, calibration or recordings into this product tree.
- Public fetched assets belong in core third_party; verify pinned source/version/hashes and licenses/notices. No private prebuilt runtime or model-weight export. Optional unconfigured components fail explicitly, without breaking synthetic use or silently substituting a physical device.
- Use explicit XRB_CORE and selected user workspace. Configuration/calibration/preferences live in user config/plugins/input-hands, recordings in user .xrb/hand-tracking, caches/builds under user build. Existing unknown/invalid/linked data is preserved and blocks unsafe use.
- Native output/CTest use the generic selected-origin plan and user cache. Native query/create do not start a producer. Stop joins; destroy stops; no late callbacks. Publish finite validated 21-joint metre poses, stable IDs and host-clock times; native gesture bits remain zero.
- Keep samples/hand-tracking/fixtures/hand.json deterministic/shared. Invalid fixtures are diagnostics, not valid application input; empty/dropout observations remain visible.
- Test the frozen public embedded graph, full diagnostic strict types and Node fixtures, focused synthetic native CTest, read-only-source/user-state containment, actual normal panel synthetic UI and public-only install. Report optional/hardware/model/distribution gaps; do not turn skips into passes.
