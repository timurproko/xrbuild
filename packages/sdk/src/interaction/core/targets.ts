// Interaction targets: what an app registers with the Interactor. A target lives in the frame
// of a scene object; its sizes are metres of the physical panel, whatever the scene mapping.
// The Interactor fills `state` every frame (hover, capture) and calls `on` with events.
import * as THREE from 'three';
import type { SceneHand } from '../../scene-hands.ts';
import type { InteractionTuning } from './tuning.ts';

export type TargetKind = 'poke' | 'pinch' | 'grab' | 'volume';
export type EventSource = TargetKind | 'mouse';

export interface TargetEvent {
  type: 'start' | 'move' | 'end';
  target: Target;
  /** which input took the target: the hand kind, or the mouse */
  source: EventSource;
  /** hand id, -1 for the mouse */
  handId: number;
  hand: SceneHand | null;
  /** position in the target's local frame, metres: fingertip (poke), pinch point (pinch, grab), contact mean (volume) */
  local: THREE.Vector3;
  /** the same point in world coordinates */
  world: THREE.Vector3;
  /** poke: how far the surface is pushed in, 0..travel */
  depth: number;
  /** volume: the hand keypoints inside, world coordinates */
  points: THREE.Vector3[];
  /** mouse: the pointer ray in world coordinates */
  ray: THREE.Ray | null;
  /** end: why the capture ended */
  reason?: 'release' | 'lost' | 'disabled' | 'removed';
}

export interface TargetState {
  /** a hand (or the mouse) hovers the target */
  hovering: boolean;
  /** 0..1: how close the nearest hovering input is (poke: 0 at hoverDistance, 1 at the surface; others: 0 outside, 1 at the centre) */
  proximity: number;
  /** local metres of the nearest hovering input (fingertip or pinch point) */
  cursor: THREE.Vector3;
  /** the target is taken (pressed, pinched, grabbed or filled) */
  held: boolean;
  /** poke: how far the surface is pushed in, 0..travel; follows the hovering fingertip before the press too */
  depth: number;
  /** who holds it: hand id, -1 mouse, null nobody */
  holder: number | null;
  /** the mouse points at the target (browser) */
  mouseOver: boolean;
}

export type TargetListener = (e: TargetEvent) => void;

export abstract class Target {
  abstract readonly kind: TargetKind;
  readonly object: THREE.Object3D;
  /** a disabled target ignores input and drops its capture */
  enabled = true;
  /** per-target overrides of the shared tuning */
  tuning: Partial<InteractionTuning> = {};
  readonly state: TargetState = { hovering: false, proximity: 0, cursor: new THREE.Vector3(), held: false, depth: 0, holder: null, mouseOver: false };
  private readonly listeners = new Set<TargetListener>();

  constructor(object: THREE.Object3D) {
    this.object = object;
  }

  on(fn: TargetListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** @internal */
  emit(e: TargetEvent): void {
    for (const fn of this.listeners) fn(e);
  }
}

export interface PokeOptions {
  /** outline test in local metres (x, y); the tuning's pokeMargin is applied by the caller's outline or via `margin` */
  inside: (x: number, y: number) => boolean;
  /** local z of the rest surface, metres (the surface faces +z) */
  top: number;
  /** how far the surface can be pushed in, metres */
  travel: number;
  /** centre of the outline in local metres (default 0,0): breaks ties between adjacent poke targets */
  centre?: THREE.Vector2;
}

/** Pressed by a fingertip along +z: buttons, switches, segments, touch-dragged handles. */
export class PokeTarget extends Target {
  readonly kind = 'poke' as const;
  inside: (x: number, y: number) => boolean;
  top: number;
  travel: number;
  centre: THREE.Vector2;
  constructor(object: THREE.Object3D, options: PokeOptions) {
    super(object);
    this.inside = options.inside;
    this.top = options.top;
    this.travel = options.travel;
    this.centre = options.centre ?? new THREE.Vector2();
  }
}

export interface PointOptions {
  /** centre in local metres (default: the object's origin) */
  position?: THREE.Vector3;
  /** engage radius, metres (default: the tuning's pinchRadius / grabRadius) */
  radius?: number;
}

/** Taken by a pinch starting near it, follows the pinch point: slider handles, dials, markers. */
export class PinchTarget extends Target {
  readonly kind = 'pinch' as const;
  position: THREE.Vector3;
  radius: number | null;
  constructor(object: THREE.Object3D, options: PointOptions = {}) {
    super(object);
    this.position = options.position ?? new THREE.Vector3();
    this.radius = options.radius ?? null;
  }
}

/** Taken by a pinch or a fist near it, follows the hand (position and palm): movable objects. */
export class GrabTarget extends Target {
  readonly kind = 'grab' as const;
  position: THREE.Vector3;
  radius: number | null;
  constructor(object: THREE.Object3D, options: PointOptions = {}) {
    super(object);
    this.position = options.position ?? new THREE.Vector3();
    this.radius = options.radius ?? null;
  }
}

/** Reacts to hand keypoints inside a sphere: the trackball. */
export class VolumeTarget extends Target {
  readonly kind = 'volume' as const;
  position: THREE.Vector3;
  radius: number;
  constructor(object: THREE.Object3D, options: { radius: number; position?: THREE.Vector3 }) {
    super(object);
    this.position = options.position ?? new THREE.Vector3();
    this.radius = options.radius;
  }
}

export type AnyTarget = PokeTarget | PinchTarget | GrabTarget | VolumeTarget;
