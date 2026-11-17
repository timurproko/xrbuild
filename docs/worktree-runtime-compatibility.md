# Worktree completion runtime compatibility

Policy: [Shared delivery rules](delivery-rules.md), R13–R16, and the `xrbuild` entry in
[Delivery adapters](delivery-adapters.json). Operational sequence: [published local removal](published-local-removal.md).
This record distinguishes repository integration, reproducible candidate evidence and released-runtime compatibility.

## Repository integration

`.a1/worktree.json` declares paired exact merged-completion and distinct published-local-removal commands, all with
`{primary}`, `{worktree}` and the original `{snapshot}`. No sweep is declared. `a1 worktree complete` is the merged
completion entry point; `a1 worktree remove-local` has separate publication authority. XR's CLI queues those commands
without doing deletion from the issuing batch. The runtime reads the selected primary's declaration, not the task's
copy. Consequently a task-branch declaration does not change current primary behavior before merge. Do not exercise
an older primary's legacy declaration as a fallback.

XR imports only the supported `@timurproko/a1/dist/foundation/lifecycle/worktree-cleanup-snapshot.mjs` and
`worktree-claim-boundary.mjs` modules from an explicitly provisioned primary-checkout dependency. There is no global
runtime-file copy, automatic dependency/cache discovery, package install, ownership-file reader or parallel lock
protocol. Missing public APIs produce `XRB_RUNTIME_UNAVAILABLE`; A1 receives `xrb-runtime-unavailable` in the bounded
preflight refusal and retains the attachment. Detailed public diagnostics remain in XR's JSON report. XR's queue-only
helper also checks this dependency before issuing an A1 request. Compatible paired runtimes reject legacy declarations
and unexpanded/invalid snapshots before detachment. This does not retrofit an obsolete A1 command's ordering.
Unknown/unverifiable states never select sweep, discard, force removal or a replacement approval.

## Published artifacts inspected — 2026-11-17 UTC

Read the registry's versions and current distribution tags, then inspect the actual tarball inventories and verify
their SHA-512 against the registry metadata. No runtime was installed or published.

| Current channel | Artifact | Archive SHA-256 | Required public modules |
| --- | --- | --- | --- |
| `latest` | `@timurproko/a1@0.2.6` (`a1-0.2.6.tgz`, 4,612,397 bytes) | `1df85e054f58e73a56f800e2843164326678f7bb48ae5a66f0acd1c294dfbce2` | Both absent |
| `next`, `a1-staging` | `@timurproko/a1@0.2.7-dev.1342` (`a1-0.2.7-dev.1342.tgz`, 4,442,475 bytes) | `698f1b74c79101c2fe8c8e121cbc3f1c1d4ad430f79a39bc13d96bf994263883` | Both absent |

Registry artifact URLs are `https://registry.npmjs.org/@timurproko/a1/-/<filename>`. Verified integrity values:

- `0.2.6`: `sha512-vYMXSd2ZXCfRDteaakIbuORurMBaGzlNbcIfopWBsPqI5ZxpuA9Ql0e7KyNB6sNtv3BGWOsoJM6oDN1vGshVkA==`
- `0.2.7-dev.1342`: `sha512-0aO93WAZoEbsxfq4ARHGpSijVDVKDPmfYIyb9co3HAHTpSSDVfgCI+a1kiKHdlgdZRnkVSZzwsZjwq+6HkApSg==`

Inspection of `0.2.7-dev.1342`'s shipped completion module also finds schema v1: it detaches before reading its cleanup
declaration and has no preservation preflight. It therefore **cannot meet pre-detach refusal**, even though the new
`{snapshot}` selector would block its later cleanup settlement. Do not run that obsolete direct A1 command against
real worktrees. XR cannot retrofit the old host through a declaration; compatible paired runtime release/rollout is
an external prerequisite. No workaround or parallel host/ownership implementation is introduced here.

**No compatible released artifact is verified; no minimum version is asserted.** Neither a newer-sounding version
nor candidate source proves compatibility. The exact external prerequisite is an actually published package exposing
the supported snapshot/tracked execution boundary and paired completion orchestration, then verification of that
artifact and compatible participating attachment writers in the existing namespace. Issue
[#20](https://github.com/timurproko/xrbuild/issues/20) remains open for that work, not for the repository wiring.

## Exact offline candidate tested

The immutable offline pin is `tools/worktree/proposed-a1-interface.json`:

- Public A1 source `691b381c29fe5c5d558491ff519b300bf426a730`, tree `2c1518b90e86a85d5702ef48f258df62f5038585`.
- Built candidate `@timurproko/a1@0.2.7-dev`, archive `timurproko-a1-0.2.7-dev.tgz`, 4,480,908 bytes.
- SHA-256 `bb76eb2ae0d152acacd5def472398da7115b5411043968b80c3cf6a65a7b80d0`.
- Integrity `sha512-gfr8e6EUYzmkCoZdatk7/FyKsH2OVIra8hYJqZs57lZvh3kcDclDc23z1mEwPqAtNa8MiVUfxV8OL2SZ2pAtKQ==`.
- Frozen lock SHA-256 `7e687b8939ee6ea5d314a9699cbb6be3a03fb9d236a5d6d843dca11f20afb3d1`.
- Node `v24.21.0`, npm `11.13.0`, Windows x64, Git `2.56.0.windows.2`; two unchanged official build/pack runs
  reproduced the same archive. Nineteen imported/declaration/license files have pinned built/source/blob identities.

Tests use the unpacked package, real registered fixture participants, actual completion request/settlement and real XR
CLI children. Only external GitHub evidence transport is replaced. Lifecycle imports beyond the two public modules
are test-host imports only, never production XR integration. No private upstream implementation is copied.

Required compatible behavior includes original opaque approval capture before preflight, paired adapter digest
binding, issuing-batch exit before settlement, single-use requests, same-namespace editing-claim exclusion, full
controller exclusion and tracked destructive descendants through actual close. Changed HEAD/physical checkout,
private/dirty/unpublished data, live owners, unsupported declarations and uncertain journals must refuse. Candidate
Windows v2 gates use witnessed lifetime evidence; historical gates and other platforms have explicit conservative
limits. XR never recovers gates or resets uncertain journals automatically.

The 16 existing runtime tests and 15 subprocess completion tests passed against this candidate; all 50 frozen shared
cases passed unchanged. These are isolated end-to-end **candidate** results, not a released/installed end-to-end
workflow claim. Re-run the same lanes against the actual released artifact before rollout. Stop/upgrade/restart of
incompatible writers needs separate operational authorization; do not terminate user processes, silently change
namespaces or install the candidate into the daily runtime. No production cleanup was performed.
