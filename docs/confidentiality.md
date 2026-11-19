# Confidentiality

This repository is public. The private workspace (`.xrbuild/`) is not. These rules keep the two apart.

## Names stay out of the core

- Never use a proprietary name - a vendor, product or SDK, client, person, or where code came from - in core files,
  paths outside `.xrbuild/`, OpenSpec artifacts or commit messages. Describe the role instead ("a 3D display", "a hand
  tracker", "a station platform"); in examples use made-up names (`stereo-panel`, `tracker`, `station`). The entire
  private `.xrbuild/` clone is outside the core naming rule: plugin paths, project samples, manifests and
  pinned LFS dependency filenames may use external names. No `.xrbuild/` exception applies to core contents.
  Do not publish `.xrbuild/` or its LFS objects as part of a public export.
- `pnpm check:names` (`tools/name-guard`) enforces that boundary from hashes only (`banned.sha256`, no plain list anywhere);
  an editor hook refuses such edits and installing dependencies enables a pre-commit check. To ban another name:
  `pnpm names add <name>` (`--exact` for one whose lower-case form is an ordinary word), then commit the hash file.
- A concrete integration belongs in the selected workspace (`.xrbuild/plugins/<name>` for repository development)
  or, after an explicit public export audit/approval, in `embedded/plugins/<name>`. Never put concrete integration
  branches in the generic engine. Core features reach plugins only through the C ABI (`native/plugin-sdk/include/xrb_plugin.h`), the host channel
  and the packager contract (`packages/control-panel/src/packagers.ts`). A plugin-specific need is a plugin key
  (`--plugin.<name>.<key>=`), a capability or a new neutral ABI call, never a plugin branch in the core.
- Docs and specs describe roles ("a display plugin", "a station platform"), not plugins.

## What belongs where

- Generic engine code and approved public modules under `embedded/` belong to this repository. `embedded/` is
  core-owned, not another repository; it shares plugin and project layouts with the selected user workspace.
- Private-only code belongs to the private repository, with nothing added here for it. Work that needs both is
  changed in each repository separately.
- Never put private repository links, source inventories or client details in anything public: code,
  documentation, specifications or commit messages.

## Public export

- Moving private source into this repository is a separate decision, never a side effect of other work. Approval
  to implement something is not approval to export private source.
- Every public snapshot needs an exact audited allowlist and explicit owner approval, and never brings private
  history with it.
- Detaching the private workspace did not remove private history from earlier commits. Keep hosting private until
  an isolated history audit and a separate licensing review say otherwise.
