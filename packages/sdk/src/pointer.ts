// Turns a tracked hand into ordinary DOM pointer events, so apps written for the
// mouse (raycaster picking, OrbitControls, drag handlers) work with hands unchanged.
//
// Where the hand points: the ray from the viewer's eyes through the index fingertip,
// intersected with the panel plane, i.e. the spot on the glass that sits behind the
// fingertip from the viewer's point of view. Pinch = button down, release = up + click.
import { KP, type Hand } from './hands.ts';
import type { DisplayInfo } from './host.ts';
import type { Vec3 } from './protocol.ts';

/** Fingertip -> normalized position on the panel (u right, v down, 0..1), seen from `eye`. */
export function projectToPanel(eye: Vec3, tip: Vec3, display: DisplayInfo): { u: number; v: number } | null {
  const dz = eye[2] - tip[2];
  if (dz <= 1e-4) return null;  // fingertip at or behind the eye
  const s = eye[2] / dz;        // eye + s * (tip - eye) lands on z = 0
  const x = eye[0] + s * (tip[0] - eye[0]);
  const y = eye[1] + s * (tip[1] - eye[1]);
  return { u: x / display.widthM + 0.5, v: 0.5 - y / display.heightM };
}

/** Prefers the pinching hand, then the one reaching furthest toward the panel. */
export function choosePointerHand(hands: Hand[], current: number | null): Hand | null {
  if (!hands.length) return null;
  const pinching = hands.find((h) => h.pinching && h.id === current) ?? hands.find((h) => h.pinching);
  if (pinching) return pinching;
  const keep = hands.find((h) => h.id === current);
  if (keep) return keep;
  return hands.reduce((a, b) => (a.keypoints[KP.INDEX_TIP][2] < b.keypoints[KP.INDEX_TIP][2] ? a : b));
}

export interface PointerTarget {
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  dispatchEvent(e: Event): boolean;
}

export interface PointerEmulationOptions {
  /** element whose rectangle maps onto the panel (the app's canvas) */
  element: PointerTarget;
  /** element under a page point; default document.elementFromPoint, falling back to `element` */
  hitTest?: (clientX: number, clientY: number) => PointerTarget | null;
  /** also send legacy mouse events (mousemove/mousedown/mouseup) */
  mouseEvents?: boolean;
  /**
   * While pinched, the pointer stays where the pinch started until the hand has moved
   * this far (fraction of the panel). Releasing a pinch always jitters a little, and apps
   * commonly ignore clicks after a few pixels of movement. Default 0.015.
   */
  dragSlop?: number;
  /** creates events; default PointerEvent/MouseEvent from the page */
  createEvent?: (type: string, init: Record<string, unknown>) => Event;
}

export interface PointerState {
  handId: number | null;
  /** normalized panel position, null while no hand points at the panel */
  u: number;
  v: number;
  inside: boolean;
  down: boolean;
  clientX: number;
  clientY: number;
}

export class PointerEmulation {
  enabled = true;
  readonly state: PointerState = { handId: null, u: 0, v: 0, inside: false, down: false, clientX: 0, clientY: 0 };
  private readonly opts: PointerEmulationOptions;
  private downTarget: PointerTarget | null = null;
  private downAt: { u: number; v: number } | null = null;
  private dragging = false;

  constructor(options: PointerEmulationOptions) {
    this.opts = options;
  }

  /** Call once per frame with the current hands and the viewer's eye centre (panel frame). */
  update(hands: Hand[], eye: Vec3, display: DisplayInfo): void {
    if (!this.enabled) return;
    const hand = choosePointerHand(hands, this.state.handId);
    const hit = hand ? projectToPanel(eye, hand.keypoints[KP.INDEX_TIP], display) : null;
    const inside = !!hit && hit.u >= 0 && hit.u <= 1 && hit.v >= 0 && hit.v <= 1;
    const wantDown = !!hand && hand.pinching && (inside || this.state.down);

    if (!hand || !hit) {
      if (this.state.down) this.release(false);
      this.state.handId = null;
      this.state.inside = false;
      return;
    }
    this.state.handId = hand.id;
    let u = Math.min(1, Math.max(0, hit.u)), v = Math.min(1, Math.max(0, hit.v));
    if (this.state.down && this.downAt && !this.dragging) {
      if (Math.hypot(u - this.downAt.u, v - this.downAt.v) > (this.opts.dragSlop ?? 0.015)) this.dragging = true;
      else ({ u, v } = this.downAt);
    }
    this.state.u = u;
    this.state.v = v;
    this.state.inside = inside;
    const r = this.opts.element.getBoundingClientRect();
    this.state.clientX = r.left + this.state.u * r.width;
    this.state.clientY = r.top + this.state.v * r.height;

    if (inside || this.state.down) this.send('pointermove', this.state.down ? this.downTarget : null, this.state.down ? 1 : 0);
    if (wantDown && !this.state.down) {
      this.state.down = true;
      this.downAt = { u: this.state.u, v: this.state.v };
      this.dragging = false;
      this.downTarget = this.targetAt(this.state.clientX, this.state.clientY);
      this.send('pointerdown', this.downTarget, 1);
    } else if (!wantDown && this.state.down) {
      this.release(true);
    }
  }

  private release(click: boolean): void {
    const target = this.downTarget;
    this.state.down = false;
    this.send('pointerup', target, 0);
    if (click && target && this.targetAt(this.state.clientX, this.state.clientY) === target) this.send('click', target, 0);
    this.downTarget = null;
    this.downAt = null;
    this.dragging = false;
  }

  private targetAt(x: number, y: number): PointerTarget {
    const hit = this.opts.hitTest
      ? this.opts.hitTest(x, y)
      : (globalThis.document?.elementFromPoint(x, y) as unknown as PointerTarget | null);
    return hit ?? this.opts.element;
  }

  private send(type: string, target: PointerTarget | null, buttons: number): void {
    const t = target ?? this.targetAt(this.state.clientX, this.state.clientY);
    const init = {
      bubbles: true, cancelable: true, composed: true,
      clientX: this.state.clientX, clientY: this.state.clientY,
      screenX: this.state.clientX, screenY: this.state.clientY,
      button: 0, buttons,
      // Same id as the mouse: OrbitControls and similar code call setPointerCapture(pointerId),
      // which only accepts a pointer the browser knows.
      pointerId: 1, pointerType: 'mouse', isPrimary: true, width: 1, height: 1, pressure: buttons ? 0.5 : 0,
    };
    const make = this.opts.createEvent ?? ((ty: string, i: Record<string, unknown>) =>
      ty === 'click' || ty.startsWith('mouse') ? new MouseEvent(ty, i) : new PointerEvent(ty, i));
    t.dispatchEvent(make(type, init));
    if (this.opts.mouseEvents !== false && type.startsWith('pointer')) t.dispatchEvent(make(type.replace('pointer', 'mouse'), init));
  }
}
