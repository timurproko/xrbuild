// The UIKit DotSphere affordance: a shell of glowing dots on an icosphere
// (subdivision 3 = 642 dots) that fades in while a hand touches the trackball
// and rotates with the object, which makes the spin readable.
import * as THREE from 'three';

export interface DotShellOptions {
  radius: number;
  color?: THREE.ColorRepresentation;
  /** dot radius as a fraction of the shell radius (larger than a native app's 0.0064: reads better on the web) */
  dotRadius?: number;
  /** fade speed (10 per second) */
  fadeSpeed?: number;
}

export class DotShell extends THREE.InstancedMesh {
  /** set true while the shell should be visible */
  active = false;
  private opacity = 0;
  private readonly fadeSpeed: number;

  constructor(options: DotShellOptions) {
    const r = options.radius;
    const points = icosphereVertices(3).map((v) => v.multiplyScalar(r));
    const disc = new THREE.CircleGeometry(r * (options.dotRadius ?? 0.016), 12);
    const material = new THREE.MeshBasicMaterial({
      color: options.color ?? new THREE.Color(0.18, 0.75, 1.0),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
    });
    super(disc, material, points.length);
    this.name = 'xrb-dot-shell';
    this.fadeSpeed = options.fadeSpeed ?? 10;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), z = new THREE.Vector3(0, 0, 1);
    points.forEach((p, i) => {
      q.setFromUnitVectors(z, p.clone().normalize());  // disc faces outward
      this.setMatrixAt(i, m.compose(p, q, new THREE.Vector3(1, 1, 1)));
    });
    this.instanceMatrix.needsUpdate = true;
    this.renderOrder = 10;
    this.visible = false;
  }

  update(dt: number): void {
    const target = this.active ? 1 : 0;
    this.opacity = this.active ? 1 : THREE.MathUtils.lerp(this.opacity, 0, Math.min(1, dt * this.fadeSpeed));
    if (!this.active && this.opacity < 0.01) this.opacity = 0;
    (this.material as THREE.MeshBasicMaterial).opacity = this.opacity;
    this.visible = this.opacity > 0 || target > 0;
  }
}

/** Unique vertices of an icosphere: 12, 42, 162, 642 for detail 0..3. */
export function icosphereVertices(detail: number): THREE.Vector3[] {
  const g = new THREE.IcosahedronGeometry(1, detail === 0 ? 0 : 2 ** detail - 1);
  const pos = g.getAttribute('position');
  const seen = new Map<string, THREE.Vector3>();
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i).normalize();
    seen.set(`${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`, v);
  }
  g.dispose();
  return [...seen.values()];
}
