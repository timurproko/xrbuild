// Base of every control: a group placed in the scene with a title and a status line under it,
// an enabled flag (Interactable), events, and its interaction targets. Hands and the mouse both
// come through the SDK's interaction core: a control registers targets (poke, pinch, volume) in
// its own frame and reads their state each frame; it has no hand code of its own.
import * as THREE from 'three';
import { PokeTarget, type AnyTarget, type EventSource, type Interactor } from '@xr-build/sdk';
import { Label } from './label.ts';
import { COLORS } from './theme.ts';

/** Disabled look: colours move this far toward the tint; opacity stays (nothing goes see-through). */
const DISABLED_STRENGTH = 0.35;
const DISABLED_TINT = new THREE.Color('#5a606b');

export type Listener = (detail: Record<string, unknown>) => void;
/** Where an event came from: a hand (any mode) or the mouse. */
export const sourceOf = (s: EventSource): 'hand' | 'mouse' => (s === 'mouse' ? 'mouse' : 'hand');

export abstract class Control extends THREE.Group {
  enabled = true;
  readonly title: Label;
  readonly status: Label;
  protected readonly targets: AnyTarget[] = [];
  protected interactor: Interactor | null = null;
  private readonly listeners = new Map<string, Set<Listener>>();
  /** 1 at full strength; DISABLED_STRENGTH of each colour is left when disabled */
  private dim = 1;

  constructor(title: string, labelY: number) {
    super();
    this.userData.control = this;
    this.title = new Label(title, { size: 0.0085, weight: 700 });
    this.title.position.set(0, labelY, 0.001);
    this.status = new Label('', { size: 0.0068, weight: 500, color: COLORS.muted });
    this.status.position.set(0, labelY - 0.0115, 0.001);
    this.add(this.title, this.status);
  }

  /** Registers the control's targets with the interaction core (`xrb.interaction`). */
  attach(interactor: Interactor): this {
    this.interactor = interactor;
    for (const t of this.targets) interactor.add(t);
    return this;
  }

  detach(): void {
    if (this.interactor) for (const t of this.targets) this.interactor.remove(t);
    this.interactor = null;
  }

  /** Adds a target of this control (registered at once when attached). */
  protected target<T extends AnyTarget>(t: T): T {
    this.targets.push(t);
    t.enabled = this.enabled;
    this.interactor?.add(t);
    return t;
  }

  /** The mouse points at one of the control's targets. */
  get mouseOver(): boolean {
    return this.targets.some((t) => t.state.mouseOver);
  }

  on(type: string, fn: Listener): this {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
    return this;
  }

  protected emit(type: string, detail: Record<string, unknown> = {}): void {
    for (const fn of this.listeners.get(type) ?? []) fn(detail);
  }

  /** Per frame: read the targets, animate. Disabled controls still animate back to rest. */
  abstract update(dt: number): void;

  /** Disabled controls fade and ignore input; the core drops any press or grab in progress. */
  setEnabled(v: boolean): void {
    if (v === this.enabled) return;
    this.enabled = v;
    for (const t of this.targets) t.enabled = v;
    if (!v) this.cancel();
  }

  /** Called when the control is disabled (its captures are already released by the core). */
  protected cancel(): void {}

  /**
   * Fades the whole control toward its enabled/disabled look: disabled, every colour is greyed
   * toward DISABLED_TINT. Opacity is never touched (see-through handles over their tracks looked
   * odd, and an opaque material left transparent drops out of what glass shows behind it).
   * Call from update, after the control's own per-frame colours (hover, press): a colour other
   * than the one written here last is taken as the material's new own colour.
   */
  protected fade(dt: number): void {
    const target = this.enabled ? 1 : DISABLED_STRENGTH;
    if (this.dim === 1 && target === 1) return;
    this.dim += (target - this.dim) * (1 - Math.exp(-10 * dt));
    if (Math.abs(this.dim - target) < 0.002) this.dim = target;
    this.traverse((o) => {
      const m = (o as THREE.Mesh).material as (THREE.Material & { color?: THREE.Color }) | undefined;
      if (!m?.color || o.userData.keepLook) return;
      const u = m.userData as { ownColor?: THREE.Color; fadedColor?: THREE.Color };
      if (!u.ownColor || !u.fadedColor || !m.color.equals(u.fadedColor)) u.ownColor = (u.ownColor ?? new THREE.Color()).copy(m.color);
      m.color.copy(u.ownColor).lerp(DISABLED_TINT, 1 - this.dim);
      u.fadedColor = (u.fadedColor ?? new THREE.Color()).copy(m.color);
    });
  }
}

/** The touch cursor: a ring on a surface under the hovering fingertip, tightening as it nears. */
export function touchCursor(): THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.0042, 0.0056, 32),
    new THREE.MeshBasicMaterial({ color: COLORS.accent, transparent: true, opacity: 0, depthWrite: false }),
  );
  m.userData.keepLook = true;
  m.raycast = () => {};
  m.renderOrder = 5;
  return m;
}

/** Places the touch cursor from a poke target's hover state (fingertip position and proximity). */
export function placeCursor(cursor: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>, poke: PokeTarget, z: number, enabled: boolean): void {
  const s = poke.state;
  const p = enabled && (s.hovering || (s.held && s.holder !== -1)) ? Math.max(s.proximity, s.held ? 1 : 0) : 0;
  cursor.visible = p > 0.01;
  cursor.position.set(s.cursor.x, s.cursor.y, z + 0.0004);
  cursor.scale.setScalar(2.2 - 1.2 * p);
  cursor.material.opacity = 0.25 + 0.75 * p;
}
