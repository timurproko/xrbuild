# Retained depth geometry primitives

This source is not an active Hands acquisition/inspection workflow. Geometry, point sampling and the existing
surface reconstruction algorithms remain dependencies of calibration and the retained future two-camera provider.
The former laboratory page, comparisons and benchmarks are removed; no camera/model starts on import.

The geometric frame is color-camera optical metres, not panel/app coordinates. Aligned pixels and the original
sensor depth value require the declared SDK geometry/intrinsics/extrinsics and depth scale; missing qualification
is an error, not an assumed transform. Calibrated point sampling rejects missing/unsupported depth, inadequate
support, noisy/edge patches, pairing/clock/order problems and invalid reprojection. Manual/marker calibration uses
this point sampler without a hand model.

Hand-surface reconstruction, when used by a future provider, measures surfaces at model landmark locations—not
anatomical joint centres or ground-truth skeleton geometry. Invalid joints remain invalid; source/model-relative data and
camera-metric measurements must not be overlaid as one unqualified frame. It must not silently apply global Hands
adjustments, repair observations, infer unseen anatomy or claim physical accuracy from software validation.

Original recorded depth packets remain decoded pixels/provenance in Hands Record. Basic playback does not invoke
the reconstruction engine, re-run inference or upgrade calibration. See [recording compatibility](depth-recording.md).
