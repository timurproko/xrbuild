// The mouse cursor on a 3D display: on the panel the OS pointer is not part of the 3D picture, so a small
// ring is drawn in the scene where the mouse ray lands - on the target under it, else on the
// glass. It faces the viewer, tightens over a target and dips while the button is down.
import * as THREE from 'three';
import type { PanelFrame } from '../../stereo.ts';
import type { Interactor } from './interactor.ts';
import { resolveCursorStyle, type CursorStyle } from '../../cursor-style.ts';

export interface MouseCursorOptions {
  style?: CursorStyle;
  color?: THREE.ColorRepresentation;
  /** ring radius in panel metres */
  radius?: number;
  /** hide after this long without pointer movement (ms); 0 = never */
  hideAfterMs?: number;
}

export class MouseCursor extends THREE.Group {
  private readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly dot: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private readonly radius: number;
  private readonly hideAfterMs: number;
  private lastRay: THREE.Ray | null = null;
  private lastMoveAt = 0;
  private size = 1;
  readonly style: CursorStyle;

  constructor(options: MouseCursorOptions = {}) {
    super();
    this.name = 'xrb-mouse-cursor';
    this.style = resolveCursorStyle(options.style);
    this.radius = options.radius ?? 0.006;
    this.hideAfterMs = options.hideAfterMs ?? 3000;
    const color = options.color ?? '#ffffff';
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }));
    this.dot = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }));
    for (const m of [this.ring, this.dot]) { m.renderOrder = 1000; m.raycast = () => {}; }
    this.add(this.ring, this.dot);
    this.visible = false;
  }

  /**
   * Per frame (Xrb calls this): places the cursor where `interactor.pointer` lands, on the panel
   * plane when nothing is under the mouse. `eye` is the viewer's world position to face.
   */
  update(interactor: Interactor, panel: PanelFrame, eye: THREE.Vector3, nowMs: number, dt: number): void {
    const p = interactor.pointer;
    if (!p || this.style === 'system') { this.visible = false; this.lastRay = null; return; }
    if (!this.lastRay || !p.ray.origin.equals(this.lastRay.origin) || !p.ray.direction.equals(this.lastRay.direction)) {
      this.lastRay = p.ray.clone();
      this.lastMoveAt = nowMs;
    }
    if (this.hideAfterMs > 0 && nowMs - this.lastMoveAt > this.hideAfterMs && !p.down) { this.visible = false; return; }
    let at = p.world;
    if (!at) {
      // The glass: panel-frame plane z = 0.
      const r = p.ray.clone().applyMatrix4(panel.toPanel);
      if (Math.abs(r.direction.z) < 1e-6) { this.visible = false; return; }
      const t = -r.origin.z / r.direction.z;
      if (t < 0) { this.visible = false; return; }
      at = panel.pointToWorld([r.origin.x + r.direction.x * t, r.origin.y + r.direction.y * t, 0], new THREE.Vector3());
    }
    this.visible = true;
    this.position.copy(at);
    this.lookAt(eye);
    // Size: panel metres -> world; tighter over a target, smaller while pressed.
    const want = (p.target ? 0.75 : 1) * (p.down ? 0.6 : 1);
    this.size += (want - this.size) * (1 - Math.exp(-18 * dt));
    const s = this.radius * panel.scale * this.size;
    this.scale.setScalar(s);
    this.ring.material.opacity = p.target ? 1 : 0.8;
    this.dot.visible = this.style === 'ring-dot' && !!p.target?.enabled;
  }
}
