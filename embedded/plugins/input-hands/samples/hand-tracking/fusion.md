# Retained two-camera provider starting point

The two-view fusion algorithms and browser hand-landmark acquisition remain in this source package, **unwired from
all product pages**, for a future provider. This change does not build that provider or expose an acquisition/fusion
laboratory. The old viewer, generated fixture, benchmarks, A/B workflows and model-rerun comparisons are removed.

`src/live/multiview/fusion.ts`, association, timing/setup and reported-clock guards retain their existing source
contracts. `src/live/session.ts`, camera/estimator workers and native RGB-D/geometry dependencies are retained inputs
for the future provider, not an alternate pipeline imported into Hands. No module import/page navigation starts them.

A future provider needs explicit owned acquisition, serial/profile-bound spatial calibration, current-run clocks,
qualified matching and output-age/order guards. The independent Calibration module is delivered next; its result is
B-to-A optical metres, not a panel transform, synchronization guarantee or physical accuracy certificate. Source
matching must not turn unknown exposure uncertainty into zero or join mismatched rigs/profiles.

The existing fusion engine rejects ambiguous associations, disagreeing/implausible geometry and stale/unqualified
pairs rather than filling missing joints or guessing an identity transform. Retained algorithm tests establish
software arithmetic/lifecycle behavior only. Device accuracy, latency, physical rig validity and the eventual
provider-to-SDK boundary require separate review/acceptance before any provider is offered to apps.

Legacy paired recording readers remain independently usable through Hands Record. Reading two streams does not
activate this engine. See [calibration contract](camera-calibration.md) and [recording compatibility](depth-recording.md).
