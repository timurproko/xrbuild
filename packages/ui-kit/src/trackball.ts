// Trackball (object rotator): put a hand into the dotted sphere and move it to turn the object;
// it coasts to a stop after the hand leaves. Modes: Full (any direction) or locked to the
// object's X, Y or Z axis (a ring shows the locked axis). The core's volume target decides when
// a hand is inside (6 keypoints in, 4 out); the SDK's Trackball3D port turns the object from
// those points. The mouse drags an arcball on the sphere.
import * as THREE from 'three';
import { DotShell, Trackball as SdkTrackball, VolumeTarget, type TrackballAxis } from '@xr-build/sdk';
import { Control } from './control.ts';
import { COLORS, approach, material } from './theme.ts';
import { styleMesh, type ThemeOptions } from './visual-theme.ts';

const AXES: Record<Exclude<TrackballAxis, 'free'>, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1),
};

export class Trackball extends Control {
  readonly radius: number;
  /** the object being turned (also what the app icon shows) */
  readonly object: THREE.Group;
  /** degrees turned so far in each mode */
  readonly turned: Record<TrackballAxis, number> = { free: 0, x: 0, y: 0, z: 0 };
  private readonly ball: SdkTrackball;
  private readonly shell: DotShell;
  private readonly volume: VolumeTarget;
  private readonly rings: Record<string, THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>>;
  private readonly last = new THREE.Quaternion();
  /** hand keypoints inside the sphere this frame (world), from the volume target */
  private points: THREE.Vector3[] = [];
  private mouse: THREE.Vector3 | null = null;
  private wasTouching = false;

  constructor(title: string, radius: number, options: ThemeOptions = {}) {
    super(title, -radius - 0.02);
    this.radius = radius;
    const visual = trackballVisual(radius);
    this.object = visual.object;
    this.rings = visual.rings;
    this.shell = visual.shell;
    this.add(this.object);
    this.ball = new SdkTrackball(this.object, { radius, axis: 'free', engageCount: 1, releaseCount: 0 });
    this.volume = this.target(new VolumeTarget(this, { radius }));
    this.listen(this.volume, (e) => {
      if (e.source === 'mouse') {
        if (e.type === 'start') { this.ball.stop(); this.mouse = e.ray ? this.sphereHit(e.ray) : null; this.showStatus(); }
        else if (e.type === 'move' && e.ray) this.mouseDrag(e.ray);
        else if (e.type === 'end') { this.mouse = null; this.showStatus(); }
        return;
      }
      this.points = e.type === 'end' ? [] : e.points;
    });
    this.showStatus();
    this.visuals.capture(this);
    if (options.theme) this.setTheme(options.theme);
  }

  get axis(): TrackballAxis {
    return this.ball.axis;
  }

  set axis(a: TrackballAxis) {
    this.ball.axis = a;
    this.showStatus();
  }

  private showStatus(): void {
    const mode = this.axis === 'free' ? 'Full' : this.axis.toUpperCase();
    this.status.set(`${this.ball.touching || this.mouse ? 'Rotating' : 'Idle'} (mode: ${mode})`);
  }

  update(dt: number): void {
    this.last.copy(this.object.quaternion);
    this.ball.update(dt, this.enabled && this.volume.state.held ? this.points : []);
    this.shell.active = this.enabled && (this.ball.touching || !!this.mouse);
    this.shell.update(dt);
    if (this.ball.touching !== this.wasTouching) {
      this.wasTouching = this.ball.touching;
      this.showStatus();
      this.emit(this.ball.touching ? 'grab' : 'release', { mode: 'hand' });
    }
    if (this.ball.touching || this.mouse) this.count(this.last);
    for (const [k, ring] of Object.entries(this.rings)) {
      const target = this.axis === k ? (this.ball.touching || this.mouse ? 0.9 : 0.45) : 0;
      ring.material.opacity = approach(ring.material.opacity, target, dt, 10);
      ring.visible = ring.material.opacity > 0.01;
    }
    this.fade(dt);
  }

  /** Adds how far the object turned since `before` to the current mode's total. */
  private count(before: THREE.Quaternion): void {
    const deg = THREE.MathUtils.radToDeg(before.angleTo(this.object.quaternion));
    if (deg > 0) {
      this.turned[this.axis] += deg;
      this.emit('rotate', { axis: this.axis, total: this.turned[this.axis] });
    }
  }

  protected cancel(): void {
    this.ball.stop();
    this.points = [];
    this.mouse = null;
  }

  // Mouse: arcball drag on the sphere (respecting the locked axis).
  private sphereHit(ray: THREE.Ray): THREE.Vector3 | null {
    const centre = this.getWorldPosition(new THREE.Vector3());
    const p = ray.intersectSphere(new THREE.Sphere(centre, this.radius), new THREE.Vector3())
      ?? ray.closestPointToPoint(centre, new THREE.Vector3());
    return p.sub(centre).normalize();
  }

  private mouseDrag(ray: THREE.Ray): void {
    const b = this.sphereHit(ray);
    if (!b || !this.mouse) return;
    const a = this.mouse.clone();
    const q = new THREE.Quaternion();
    if (this.axis === 'free') q.setFromUnitVectors(a, b);
    else {
      const axis = AXES[this.axis].clone().applyQuaternion(this.object.getWorldQuaternion(new THREE.Quaternion()));
      const pa = a.addScaledVector(axis, -a.dot(axis)), pb = b.clone().addScaledVector(axis, -b.dot(axis));
      if (pa.lengthSq() > 1e-8 && pb.lengthSq() > 1e-8) {
        const angle = pa.angleTo(pb) * Math.sign(new THREE.Vector3().crossVectors(pa, pb).dot(axis) || 1);
        q.setFromAxisAngle(axis, angle);
      }
    }
    const before = this.object.quaternion.clone();
    this.object.quaternion.premultiply(q);
    this.count(before);
    this.mouse = b;
  }
}

function trackballVisual(radius: number) {
  const object = new THREE.Group();
  object.add(robotHead(radius * 0.62));
  const rings: Record<string, THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>> = {};
  for (const [key, axis] of Object.entries(AXES)) {
    const ring = styleMesh(new THREE.Mesh(new THREE.TorusGeometry(radius * 0.8, radius * 0.012, 8, 96), new THREE.MeshBasicMaterial({ color: COLORS.accent, transparent: true, opacity: 0 })), 'trackballRing', { shape: 'torus', args: [radius * 0.8, radius * 0.012, 8, 96] }, {}, { opacity: true });
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    ring.visible = false; ring.userData.keepLook = true; ring.raycast = () => {};
    rings[key] = ring; object.add(ring);
  }
  const shell = new DotShell({ radius, color: COLORS.accent, dotRadius: 0.02 });
  styleMesh(shell, 'trackballShell', { shape: 'circle', args: [radius * 0.02, 12] }, {}, { opacity: true });
  shell.userData.keepLook = true; shell.raycast = () => {}; object.add(shell);
  return { object, rings, shell };
}

/**
 * A low-poly robot head: faceted, with eyes and a nose so every rotation is readable. Faces +Z. Exported as the
 * model alone (no interaction, no sound), e.g. for an app's 3D icon.
 */
export function robotHead(size: number): THREE.Group {
  const g = new THREE.Group();
  const shell = material('#9aa6b8', { flatShading: true, roughness: 0.55, metalness: 0.15 });
  const head = styleMesh(new THREE.Mesh(new THREE.IcosahedronGeometry(size, 1), shell), 'robotHead', { shape: 'ico', args: [size, 1] });
  head.scale.set(1, 0.92, 0.88);
  const dark = material('#1c2230', { roughness: 0.3 });
  const glow = material(COLORS.accent, { emissive: COLORS.accent, emissiveIntensity: 0.8 });
  for (const x of [-0.36, 0.36]) {
    const socket = styleMesh(new THREE.Mesh(new THREE.SphereGeometry(size * 0.24, 16, 12), dark), 'robotSocket', { shape: 'sphere', args: [size * 0.24, 16, 12] });
    socket.position.set(x * size, size * 0.15, size * 0.72);
    const pupil = styleMesh(new THREE.Mesh(new THREE.SphereGeometry(size * 0.1, 12, 8), glow), 'robotEye', { shape: 'sphere', args: [size * 0.1, 12, 8] });
    pupil.position.set(x * size, size * 0.15, size * 0.9);
    g.add(socket, pupil);
  }
  const nose = styleMesh(new THREE.Mesh(new THREE.ConeGeometry(size * 0.12, size * 0.35, 6).rotateX(Math.PI / 2), shell), 'robotNose', { shape: 'cone', args: [size * 0.12, size * 0.35, 6], finish: g => g.rotateX(Math.PI / 2) });
  nose.position.set(0, -size * 0.12, size * 0.95);
  const antenna = styleMesh(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.03, size * 0.03, size * 0.4, 6), dark), 'robotAntenna', { shape: 'cylinder', args: [size * 0.03, size * 0.03, size * 0.4, 6] });
  antenna.position.y = size * 1.05;
  const tip = styleMesh(new THREE.Mesh(new THREE.SphereGeometry(size * 0.09, 12, 8), glow), 'robotTip', { shape: 'sphere', args: [size * 0.09, 12, 8] });
  tip.position.y = size * 1.27;
  for (const x of [-1, 1]) {
    const ear = styleMesh(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.2, size * 0.2, size * 0.14, 8).rotateZ(Math.PI / 2), dark), 'robotEar', { shape: 'cylinder', args: [size * 0.2, size * 0.2, size * 0.14, 8], finish: g => g.rotateZ(Math.PI / 2) });
    ear.position.x = x * size * 0.98;
    g.add(ear);
  }
  g.add(head, nose, antenna, tip);
  return g;
}
