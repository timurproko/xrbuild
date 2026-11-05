// The arbiter (design D6): every frame, converts the hands into each target's local metres,
// gives each hand one hovered target (the nearest that qualifies), starts a capture on an engage
// edge, keeps captures through tracking noise and grace-period coasting, and ends them only on
// the target kind's release rule. The mouse is a third "hand" (a ray) through the same rules.
import * as THREE from 'three';
import { KP } from '../../hands.ts';
import type { SceneHand } from '../../scene-hands.ts';
import { GrabTarget, PinchTarget, PokeTarget, VolumeTarget, type AnyTarget, type EventSource, type Target, type TargetEvent } from './targets.ts';
import { DEFAULT_TUNING, type InteractionTuning } from './tuning.ts';

export const MOUSE_ID = -1;

interface Capture {
  target: AnyTarget;
  source: EventSource;
  /** poke: the fingertip stays pressed until it retracts past the release depth */
  depth: number;
  /** last known local point, kept while the hand coasts */
  local: THREE.Vector3;
  world: THREE.Vector3;
  points: THREE.Vector3[];
}

interface HandMemory {
  pinching: boolean;
  grabbing: boolean;
  /** poke targets this hand has approached from the front */
  armed: Set<PokeTarget>;
  /** targets hovered last frame (for the hover hysteresis) */
  hovered: Set<AnyTarget>;
}

/** A target's frame for this frame: world -> local metres and back. */
interface Frame {
  toLocal: THREE.Matrix4;
  /** local units -> metres */
  unit: number;
}

interface Candidate {
  target: AnyTarget;
  /** smaller = nearer; used to pick one target per hand */
  distance: number;
  proximity: number;
  engage: boolean;
  local: THREE.Vector3;
  world: THREE.Vector3;
  depth: number;
  points: THREE.Vector3[];
}

export interface InteractorOptions {
  tuning?: Partial<InteractionTuning>;
}

export class Interactor {
  tuning: InteractionTuning;
  private readonly targets = new Set<AnyTarget>();
  private readonly captures = new Map<number, Capture>();
  private readonly memory = new Map<number, HandMemory>();
  private readonly frames = new Map<AnyTarget, Frame>();
  private mouseRay: THREE.Ray | null = null;
  private mouseDown = false;
  private mouseTarget: AnyTarget | null = null;
  private mouseHit: THREE.Vector3 | null = null;
  /** scene units per metre of the last update */
  private unitsPerMetre = 1;

  constructor(options: InteractorOptions = {}) {
    this.tuning = { ...DEFAULT_TUNING, ...options.tuning };
  }

  add<T extends AnyTarget>(target: T): T {
    this.targets.add(target);
    return target;
  }

  remove(target: AnyTarget): void {
    this.targets.delete(target);
    for (const [id, c] of this.captures) if (c.target === target) this.end(id, c, 'removed');
    this.frames.delete(target);
    this.resetState(target);
  }

  has(target: AnyTarget): boolean {
    return this.targets.has(target);
  }

  /** The target a hand holds, or null. */
  captured(handId: number): AnyTarget | null {
    return this.captures.get(handId)?.target ?? null;
  }

  /**
   * The mouse: its last ray, the target under it or held by it, and - only while it holds a target -
   * the world point it drags (a cursor sits on the glass otherwise, and moves onto an object only
   * once the button takes it).
   */
  get pointer(): { ray: THREE.Ray; target: AnyTarget | null; world: THREE.Vector3 | null; down: boolean } | null {
    if (!this.mouseRay) return null;
    const c = this.captures.get(MOUSE_ID);
    return { ray: this.mouseRay, target: c?.target ?? this.mouseTarget, world: c ? c.world.clone() : null, down: this.mouseDown };
  }

  /** Pointer left the canvas: no hover, no cursor. */
  pointerLeave(): void {
    this.mouseRay = null;
    this.mouseTarget = null;
    this.mouseHit = null;
    for (const t of this.targets) t.state.mouseOver = false;
  }

  private tuningOf(t: Target): InteractionTuning {
    return Object.keys(t.tuning).length ? { ...this.tuning, ...t.tuning } : this.tuning;
  }

  /**
   * One frame. `hands` are the current scene hands (coasting hands included); `unitsPerMetre`
   * is the scene's scale (xrb.metre). Targets whose hand is gone are released.
   */
  update(hands: SceneHand[], unitsPerMetre: number): void {
    this.unitsPerMetre = unitsPerMetre;
    for (const t of this.targets) this.frames.set(t, this.frameOf(t));
    const present = new Map<number, SceneHand>();
    for (const h of hands) present.set(h.hand.id, h);

    // Disabled targets drop their capture.
    for (const [id, c] of this.captures) if (!c.target.enabled || !this.targets.has(c.target)) this.end(id, c, c.target.enabled ? 'removed' : 'disabled');

    // Captures first: hands keep their target until its release rule says otherwise.
    for (const [id, c] of [...this.captures]) {
      if (id === MOUSE_ID) continue;
      const h = present.get(id);
      if (!h) { this.end(id, c, 'lost'); continue; }
      if (h.hand.coasting) continue;  // no new data: hold on, no move
      this.updateCapture(id, h, c);
    }

    // Hover and engage for the free hands.
    const hoverNow = new Map<AnyTarget, { proximity: number; cursor: THREE.Vector3; depth: number }>();
    for (const h of hands) {
      const id = h.hand.id;
      const mem = this.memoryOf(id);
      const pinchEdge = h.hand.pinching && !mem.pinching;
      const grabEdge = h.hand.grabbing && !mem.grabbing;
      mem.pinching = h.hand.pinching;
      mem.grabbing = h.hand.grabbing;
      if (this.captures.has(id) || h.hand.coasting) continue;
      let best: Candidate | null = null;
      for (const t of this.targets) {
        if (!t.enabled || this.holderOf(t) !== null) continue;
        const c = this.candidate(t, h, mem, pinchEdge, grabEdge);
        if (!c) continue;
        if (!best || c.distance < best.distance) best = c;
      }
      // Hover hysteresis: a target hovered last frame keeps hover a little further out.
      const keep = new Set<AnyTarget>();
      if (best) {
        keep.add(best.target);
        const prev = hoverNow.get(best.target);
        if (!prev || best.proximity > prev.proximity) hoverNow.set(best.target, { proximity: best.proximity, cursor: best.local, depth: best.depth });
        if (best.engage) this.begin(id, h, best);
      }
      mem.hovered = keep;
    }
    for (const id of [...this.memory.keys()]) if (!present.has(id) && id !== MOUSE_ID) this.memory.delete(id);

    // Mouse: hover from the last pointer position.
    if (this.mouseRay && !this.captures.has(MOUSE_ID)) {
      const hit = this.pick(this.mouseRay);
      this.mouseTarget = hit?.target ?? null;
      this.mouseHit = hit?.world ?? null;
    }

    // Publish state.
    for (const t of this.targets) {
      const s = t.state;
      const hover = hoverNow.get(t);
      s.hovering = !!hover;
      s.proximity = hover?.proximity ?? 0;
      if (hover) s.cursor.copy(hover.cursor);
      const holder = this.holderOf(t);
      s.held = holder !== null;
      s.holder = holder;
      s.depth = holder !== null ? this.captures.get(holder)!.depth : hover?.depth ?? 0;
      s.mouseOver = this.mouseTarget === t;
    }
  }

  // ---- mouse --------------------------------------------------------------------------------

  /** Pointer moved: `ray` in world coordinates (from the camera through the pointer). */
  pointerMove(ray: THREE.Ray): void {
    this.mouseRay = ray.clone();
    const c = this.captures.get(MOUSE_ID);
    if (!c) return;
    const f = this.frames.get(c.target) ?? this.frameOf(c.target);
    const local = this.rayPoint(c.target, f, ray);
    if (!local) return;
    c.local.copy(local);
    c.world.copy(this.toWorld(c.target, f, local));
    if (c.target.kind === 'poke') c.depth = c.target.travel;
    c.target.emit(this.event('move', c.target, 'mouse', MOUSE_ID, null, c, ray));
  }

  /** Pointer pressed: takes the nearest target under the ray. Returns true if one was taken. */
  pointerDown(ray: THREE.Ray): boolean {
    this.mouseRay = ray.clone();
    this.mouseDown = true;
    const hit = this.pick(ray);
    if (!hit) return false;
    const c: Capture = { target: hit.target, source: 'mouse', depth: hit.target.kind === 'poke' ? hit.target.travel : 0, local: hit.local, world: hit.world, points: [] };
    this.captures.set(MOUSE_ID, c);
    hit.target.emit(this.event('start', hit.target, 'mouse', MOUSE_ID, null, c, ray));
    return true;
  }

  pointerUp(): void {
    this.mouseDown = false;
    const c = this.captures.get(MOUSE_ID);
    if (c) this.end(MOUSE_ID, c, 'release');
  }

  /**
   * Binds pointer events of a canvas. `rayAt(u, v)` turns a position on the canvas (0..1 from the
   * top left) into a world ray; Xrb.bindMouse passes the ray from the viewer's eye through that
   * point of the glass. Returns an unbind function.
   */
  bindMouse(canvas: HTMLElement, rayAt: (u: number, v: number) => THREE.Ray, { systemCursor = true } = {}): () => void {
    const previousCursor = canvas.style?.cursor ?? '';
    if (canvas.style && !systemCursor) canvas.style.cursor = 'none';
    const ray = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return rayAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    const down = (e: PointerEvent) => { if (this.pointerDown(ray(e))) canvas.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      this.pointerMove(ray(e));
      if (!this.captures.has(MOUSE_ID)) {
        const hit = this.pick(this.mouseRay!);
        this.mouseTarget = hit?.target ?? null;
        this.mouseHit = hit?.world ?? null;
        for (const t of this.targets) t.state.mouseOver = this.mouseTarget === t;
        if (canvas.style) canvas.style.cursor = systemCursor ? (this.mouseTarget ? 'pointer' : 'auto') : 'none';
      }
    };
    const up = () => this.pointerUp();
    const leave = () => { if (!this.captures.has(MOUSE_ID)) this.pointerLeave(); };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', leave);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('pointerleave', leave);
      if (canvas.style) canvas.style.cursor = previousCursor;
    };
  }

  // ---- frames -------------------------------------------------------------------------------

  private frameOf(t: AnyTarget): Frame {
    t.object.updateMatrixWorld();
    const scale = new THREE.Vector3();
    t.object.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    const objectScale = (scale.x + scale.y + scale.z) / 3;
    return { toLocal: t.object.matrixWorld.clone().invert(), unit: objectScale / this.unitsPerMetre };
  }

  /** World point -> target local, metres. */
  private toLocal(f: Frame, p: THREE.Vector3): THREE.Vector3 {
    return p.clone().applyMatrix4(f.toLocal).multiplyScalar(f.unit);
  }

  private toWorld(t: AnyTarget, f: Frame, localMetres: THREE.Vector3): THREE.Vector3 {
    return localMetres.clone().divideScalar(f.unit).applyMatrix4(t.object.matrixWorld);
  }

  private localRay(f: Frame, ray: THREE.Ray): THREE.Ray {
    const r = ray.clone().applyMatrix4(f.toLocal);
    r.origin.multiplyScalar(f.unit);
    r.direction.normalize();
    return r;
  }

  // ---- hands --------------------------------------------------------------------------------

  private memoryOf(id: number): HandMemory {
    let m = this.memory.get(id);
    if (!m) { m = { pinching: false, grabbing: false, armed: new Set(), hovered: new Set() }; this.memory.set(id, m); }
    return m;
  }

  private holderOf(t: AnyTarget): number | null {
    for (const [id, c] of this.captures) if (c.target === t) return id;
    return null;
  }

  private candidate(t: AnyTarget, h: SceneHand, mem: HandMemory, pinchEdge: boolean, grabEdge: boolean): Candidate | null {
    const f = this.frames.get(t)!;
    const tune = this.tuningOf(t);
    if (t.kind === 'poke') {
      const tip = this.toLocal(f, h.tip);
      const inside = this.insideWithMargin(t, tip.x, tip.y, tune.pokeMargin);
      const gap = tip.z - t.top;  // > 0: in front of the surface
      if (!inside) {
        if (gap > 0 || gap < -t.travel) mem.armed.delete(t);  // left in front of it, or reached past it from the side
        return null;
      }
      if (gap > -tune.pokeArmDepth) mem.armed.add(t);
      const hoverLimit = mem.hovered.has(t) ? tune.hoverRelease : tune.hoverDistance;
      const depth = Math.min(t.travel, Math.max(0, -gap));
      const armed = mem.armed.has(t);
      const engage = armed && depth >= t.travel * tune.pressAt;
      if (gap > hoverLimit || (gap < 0 && !armed)) return null;
      const proximity = gap >= 0 ? 1 - Math.min(1, gap / tune.hoverDistance) : 1;
      const lateral = Math.hypot(tip.x - t.centre.x, tip.y - t.centre.y);
      return { target: t, distance: Math.max(0, gap) + lateral * 0.1, proximity, engage, local: tip, world: h.tip.clone(), depth, points: [] };
    }
    if (t.kind === 'pinch' || t.kind === 'grab') {
      const p = this.toLocal(f, h.pinchPoint);
      const radius = t.radius ?? (t.kind === 'pinch' ? tune.pinchRadius : tune.grabRadius);
      const d = p.distanceTo(t.position);
      const limit = mem.hovered.has(t) ? radius * 1.2 : radius;
      if (d > limit) return null;
      const engage = d <= radius && (pinchEdge || (t.kind === 'grab' && grabEdge));
      // While the fingers are already closed (no edge), the target is not available to this hand.
      if (!engage && (h.hand.pinching || (t.kind === 'grab' && h.hand.grabbing))) return null;
      return { target: t, distance: d, proximity: 1 - Math.min(1, d / radius), engage, local: p, world: h.pinchPoint.clone(), depth: 0, points: [] };
    }
    // volume
    const insideW: THREE.Vector3[] = [];
    const sum = new THREE.Vector3();
    for (const w of h.points) {
      const l = this.toLocal(f, w);
      if (l.distanceTo(t.position) < t.radius) { insideW.push(w.clone()); sum.add(l); }
    }
    const n = insideW.length;
    if (n === 0) return null;
    const mean = sum.divideScalar(n);
    const engage = n >= tune.volumeEngage;
    return { target: t, distance: mean.distanceTo(t.position), proximity: Math.min(1, n / tune.volumeEngage), engage, local: mean, world: this.toWorld(t, f, mean), depth: 0, points: insideW };
  }

  private insideWithMargin(t: PokeTarget, x: number, y: number, margin: number): boolean {
    if (t.inside(x, y)) return true;
    if (margin <= 0) return false;
    // The outline grown by `margin`: any point within `margin` of an inside point. Sampled on a ring.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (t.inside(x + Math.cos(a) * margin, y + Math.sin(a) * margin)) return true;
    }
    return false;
  }

  private begin(id: number, h: SceneHand, c: Candidate): void {
    const capture: Capture = { target: c.target, source: c.target.kind, depth: c.depth, local: c.local.clone(), world: c.world.clone(), points: c.points };
    this.captures.set(id, capture);
    c.target.emit(this.event('start', c.target, c.target.kind, id, h, capture, null));
  }

  private updateCapture(id: number, h: SceneHand, c: Capture): void {
    const t = c.target;
    const f = this.frames.get(t)!;
    const tune = this.tuningOf(t);
    if (t.kind === 'poke') {
      const tip = this.toLocal(f, h.tip);
      const gap = tip.z - t.top;
      c.depth = Math.min(t.travel, Math.max(0, -gap));
      c.local.copy(tip);
      c.world.copy(h.tip);
      if (c.depth <= t.travel * tune.releaseAt) { this.end(id, c, 'release'); return; }
    } else if (t.kind === 'pinch' || t.kind === 'grab') {
      const held = t.kind === 'pinch' ? h.hand.pinching : h.hand.pinching || h.hand.grabbing;
      if (!held) { this.end(id, c, 'release'); return; }
      c.local.copy(this.toLocal(f, h.pinchPoint));
      c.world.copy(h.pinchPoint);
    } else {
      const insideW: THREE.Vector3[] = [];
      const sum = new THREE.Vector3();
      for (const w of h.points) {
        const l = this.toLocal(f, w);
        if (l.distanceTo(t.position) < t.radius * 1.02) { insideW.push(w.clone()); sum.add(l); }
      }
      if (insideW.length <= tune.volumeRelease) { this.end(id, c, 'release'); return; }
      c.points = insideW;
      c.local.copy(sum.divideScalar(insideW.length));
      c.world.copy(this.toWorld(t, f, c.local));
    }
    t.emit(this.event('move', t, c.source, id, h, c, null));
  }

  private end(id: number, c: Capture, reason: TargetEvent['reason']): void {
    this.captures.delete(id);
    const e = this.event('end', c.target, c.source, id, null, c, id === MOUSE_ID ? this.mouseRay : null);
    e.reason = reason;
    if (c.target.kind === 'poke') this.memoryOf(id).armed.delete(c.target);
    c.target.emit(e);
  }

  private event(type: TargetEvent['type'], target: AnyTarget, source: EventSource, handId: number, hand: SceneHand | null, c: Capture, ray: THREE.Ray | null): TargetEvent {
    return { type, target, source, handId, hand, local: c.local.clone(), world: c.world.clone(), depth: c.depth, points: c.points, ray };
  }

  private resetState(t: AnyTarget): void {
    Object.assign(t.state, { hovering: false, proximity: 0, held: false, depth: 0, holder: null, mouseOver: false });
  }

  // ---- mouse picking ------------------------------------------------------------------------

  /** Where a local ray meets the plane z = `z`, or null. */
  private static planeHit(r: THREE.Ray, z: number): THREE.Vector3 | null {
    if (Math.abs(r.direction.z) < 1e-6) return null;
    const t = (z - r.origin.z) / r.direction.z;
    return t < 0 ? null : r.at(t, new THREE.Vector3());
  }

  /** The point on a target the mouse ray addresses (local metres), for a captured target. */
  private rayPoint(t: AnyTarget, f: Frame, ray: THREE.Ray): THREE.Vector3 | null {
    const r = this.localRay(f, ray);
    if (t.kind === 'poke') return Interactor.planeHit(r, t.top);
    if (t.kind === 'pinch' || t.kind === 'grab') return Interactor.planeHit(r, t.position.z) ?? r.closestPointToPoint(t.position, new THREE.Vector3());
    const hit = r.intersectSphere(new THREE.Sphere(t.position, t.radius), new THREE.Vector3());
    return hit ?? r.closestPointToPoint(t.position, new THREE.Vector3());
  }

  /**
   * Nearest enabled, free target under the ray. A surface the ray actually meets (a poke outline, a
   * volume sphere) beats a pinch / grab target the ray merely passes near, whatever their depth.
   */
  private pick(ray: THREE.Ray): { target: AnyTarget; local: THREE.Vector3; world: THREE.Vector3 } | null {
    let best: { target: AnyTarget; local: THREE.Vector3; world: THREE.Vector3; t: number; rank: number } | null = null;
    for (const t of this.targets) {
      if (!t.enabled || this.holderOf(t) !== null) continue;
      const f = this.frames.get(t) ?? this.frameOf(t);
      const r = this.localRay(f, ray);
      let local: THREE.Vector3 | null = null;
      if (t.kind === 'poke') {
        const p = Interactor.planeHit(r, t.top + t.travel);  // the surface at rest
        if (p && t.inside(p.x, p.y)) local = p;
      } else if (t.kind === 'pinch' || t.kind === 'grab') {
        const radius = t.radius ?? (t.kind === 'pinch' ? this.tuningOf(t).pinchRadius : this.tuningOf(t).grabRadius);
        const p = r.closestPointToPoint(t.position, new THREE.Vector3());
        if (p.distanceTo(t.position) <= radius && p.clone().sub(r.origin).dot(r.direction) >= 0) local = Interactor.planeHit(r, t.position.z) ?? p;
      } else {
        local = r.intersectSphere(new THREE.Sphere(t.position, t.radius), new THREE.Vector3());
      }
      if (!local) continue;
      const along = local.clone().sub(r.origin).dot(r.direction);  // metres along the ray: nearest wins
      const rank = t.kind === 'pinch' || t.kind === 'grab' ? 1 : 0;
      if (!best || rank < best.rank || (rank === best.rank && along < best.t)) best = { target: t, local, world: this.toWorld(t, f, local), t: along, rank };
    }
    return best;
  }
}

/** Index fingertip and the other keypoints a volume reads: re-exported for convenience. */
export { KP };
