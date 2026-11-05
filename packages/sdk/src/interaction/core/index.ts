// Shared hand interaction core: targets + arbiter (design D6).
export { Interactor, MOUSE_ID, type InteractorOptions } from './interactor.ts';
export { Target, PokeTarget, PinchTarget, GrabTarget, VolumeTarget, type AnyTarget, type TargetKind, type EventSource, type TargetEvent, type TargetState, type TargetListener, type PokeOptions, type PointOptions } from './targets.ts';
export { DEFAULT_TUNING, type InteractionTuning } from './tuning.ts';
export { MouseCursor, type MouseCursorOptions } from './cursor.ts';
