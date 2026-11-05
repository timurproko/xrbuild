// Off-axis stereo for a 3D display: the physical panel is a window into the scene.
// Each eye gets an asymmetric frustum through the panel's edges (Kooima's
// generalized perspective projection), and both eyes are drawn side by side
// into one canvas that the host hands to the display's runtime.
import * as THREE from 'three';
import type { DisplayInfo } from './host.ts';
import type { Vec3 } from './protocol.ts';

/** Viewer position used before the tracker reports one, and for the head camera (panel frame, metres). */
export const NOMINAL_EYE: Vec3 = [0, 0, 0.6];
export const IPD_M = 0.063;

/**
 * Off-axis projection for an eye at (ex, ey, ez) in the panel frame looking at the
 * panel rectangle [-hw, hw] x [-hh, hh] in the plane z = 0. `near`/`far` are in any unit:
 * only the frustum ratios come from the panel geometry.
 */
export function offAxisProjection(target: THREE.Matrix4, eye: Vec3, hw: number, hh: number, near: number, far: number): THREE.Matrix4 {
  const [ex, ey, ez] = eye;
  const s = near / Math.max(ez, 1e-4);
  const l = (-hw - ex) * s, r = (hw - ex) * s;
  const b = (-hh - ey) * s, t = (hh - ey) * s;
  return target.set(
    (2 * near) / (r - l), 0, (r + l) / (r - l), 0,
    0, (2 * near) / (t - b), (t + b) / (t - b), 0,
    0, 0, -(far + near) / (far - near), (-2 * far * near) / (far - near),
    0, 0, -1, 0,
  );
}

/**
 * How panel metres map into the scene.
 *  - 'camera' (default): the panel hangs in front of the app's camera, so whatever the camera
 *    looks at stays in view as the app moves its camera (OrbitControls etc.). Content at
 *    `focusDistance` scene units from the camera appears on the glass; nearer content pops out.
 *  - 'world': the panel centre sits at `center`, oriented by `quaternion`, `scale` scene units per metre.
 */
export type PanelMapping =
  | { mode: 'camera'; focusDistance?: number }
  | { mode: 'world'; center: THREE.Vector3; scale: number; quaternion?: THREE.Quaternion };

export type AppCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

export interface StereoOptions {
  mapping?: PanelMapping;
  /** render resolution multiplier per eye (1 = panel pixels); lower it to save GPU */
  resolutionScale?: number;
}

export class PanelFrame {
  /** panel metres -> world (includes scale) */
  readonly toWorld = new THREE.Matrix4();
  readonly toPanel = new THREE.Matrix4();
  /** world orientation of the panel axes */
  readonly quaternion = new THREE.Quaternion();
  /** scene units per panel metre */
  scale = 1;

  update(mapping: PanelMapping, head: THREE.Camera): void {
    if (mapping.mode === 'world') {
      this.scale = mapping.scale;
      this.quaternion.copy(mapping.quaternion ?? new THREE.Quaternion());
      this.toWorld.compose(mapping.center, this.quaternion, new THREE.Vector3(this.scale, this.scale, this.scale));
    } else {
      head.updateMatrixWorld();
      const pos = new THREE.Vector3(), scl = new THREE.Vector3();
      head.matrixWorld.decompose(pos, this.quaternion, scl);
      const focus = mapping.focusDistance ?? Math.max(pos.length(), 1e-3);
      // The nominal viewer sits exactly at the camera: panel centre is `focus` ahead, and
      // `focus` scene units correspond to the nominal viewing distance.
      this.scale = focus / NOMINAL_EYE[2];
      const local = new THREE.Matrix4().compose(
        new THREE.Vector3(-NOMINAL_EYE[0] * this.scale, -NOMINAL_EYE[1] * this.scale, -focus),
        new THREE.Quaternion(),
        new THREE.Vector3(this.scale, this.scale, this.scale),
      );
      this.toWorld.compose(pos, this.quaternion, new THREE.Vector3(1, 1, 1)).multiply(local);
    }
    this.toPanel.copy(this.toWorld).invert();
  }

  pointToWorld(p: Vec3, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(p[0], p[1], p[2]).applyMatrix4(this.toWorld);
  }
}

/** A camera positioned at a physical eye, looking through the panel rectangle. */
export function placeEyeCamera(cam: THREE.PerspectiveCamera, eye: Vec3, panel: PanelFrame, display: DisplayInfo, near: number, far: number): void {
  cam.matrixAutoUpdate = false;
  const pos = panel.pointToWorld(eye);
  cam.matrixWorld.compose(pos, panel.quaternion, new THREE.Vector3(1, 1, 1));
  cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  cam.position.copy(pos);
  cam.quaternion.copy(panel.quaternion);
  cam.near = near;
  cam.far = far;
  offAxisProjection(cam.projectionMatrix, eye, display.widthM / 2, display.heightM / 2, near, far);
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
}

/** Global clipping planes that keep immersive rendering inside the same finite panel window as other displays. */
export function panelCropPlanes(panel: PanelFrame, display: DisplayInfo): THREE.Plane[] {
  const hw = display.widthM / 2, hh = display.heightM / 2;
  return [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), -hw),
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -hw),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), -hh),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -hh),
  ].map((plane) => plane.applyMatrix4(panel.toWorld));
}

export interface EyePair {
  left: Vec3;
  right: Vec3;
}

export function nominalEyes(): EyePair {
  const [x, y, z] = NOMINAL_EYE;
  return { left: [x - IPD_M / 2, y, z], right: [x + IPD_M / 2, y, z] };
}

/**
 * Renders a scene for a 3D display. In stereo the canvas is 2 x eye width: left eye in
 * the left half, right eye in the right half. Without a host it renders one view
 * from the nominal eye, so the browser shows what the centre viewer would see.
 */
export class StereoRenderer {
  readonly panel = new PanelFrame();
  readonly leftCamera = new THREE.PerspectiveCamera();
  readonly rightCamera = new THREE.PerspectiveCamera();
  mapping: PanelMapping;
  resolutionScale: number;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly display: DisplayInfo;
  private _stereo: boolean;
  private eyeW: number;
  private eyeH: number;

  constructor(renderer: THREE.WebGLRenderer, display: DisplayInfo, stereo: boolean, eyeSize: { width: number; height: number }, options: StereoOptions = {}) {
    this.renderer = renderer;
    this.display = display;
    this._stereo = stereo;
    this.eyeW = eyeSize.width;
    this.eyeH = eyeSize.height;
    this.mapping = options.mapping ?? { mode: 'camera' };
    this.resolutionScale = options.resolutionScale ?? 1;
  }

  /** true: two eyes side by side; false: one view from between the eyes */
  get stereo(): boolean {
    return this._stereo;
  }

  /** Switches between side by side and mono; call applyCanvasSize() afterwards (Xrb.setSize does). */
  setStereo(stereo: boolean): void {
    this._stereo = stereo;
  }

  /** Size of one eye's view in CSS pixels: what the app should use for its camera aspect and layout. */
  viewSize(): { width: number; height: number } {
    return { width: this.eyeW, height: this.eyeH };
  }

  setEyeSize(width: number, height: number): void {
    this.eyeW = width;
    this.eyeH = height;
  }

  /** Sizes the canvas: 2 x eye width in stereo, the eye size otherwise. */
  applyCanvasSize(): void {
    const w = this._stereo ? this.eyeW * 2 : this.eyeW;
    this.renderer.setPixelRatio(this.resolutionScale);
    this.renderer.setSize(w, this.eyeH, true);
  }

  /**
   * Makes the head camera's projection the nominal viewer's window frustum, so raycasting
   * and screen projections in app code match what is drawn.
   */
  syncHeadCamera(head: AppCamera): void {
    this.panel.update(this.mapping, head);
    if ((head as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const eye = NOMINAL_EYE;
      offAxisProjection(head.projectionMatrix, eye, this.display.widthM / 2, this.display.heightM / 2, head.near, head.far);
      head.projectionMatrixInverse.copy(head.projectionMatrix).invert();
    }
  }

  /** Renders both eyes, or the configured orthographic camera directly in mono. */
  render(scene: THREE.Scene, head: AppCamera, eyes: EyePair): void {
    this.syncHeadCamera(head);
    const r = this.renderer;
    if (!this._stereo && (head as THREE.OrthographicCamera).isOrthographicCamera) {
      r.setScissorTest(false);
      r.setViewport(0, 0, this.eyeW, this.eyeH);
      r.render(scene, head);
      return;
    }
    if (!this._stereo) {
      const mid: Vec3 = [(eyes.left[0] + eyes.right[0]) / 2, (eyes.left[1] + eyes.right[1]) / 2, (eyes.left[2] + eyes.right[2]) / 2];
      placeEyeCamera(this.leftCamera, mid, this.panel, this.display, head.near, head.far);
      r.setScissorTest(false);
      r.setViewport(0, 0, this.eyeW, this.eyeH);
      r.render(scene, this.leftCamera);
      return;
    }
    placeEyeCamera(this.leftCamera, eyes.left, this.panel, this.display, head.near, head.far);
    placeEyeCamera(this.rightCamera, eyes.right, this.panel, this.display, head.near, head.far);
    r.setScissorTest(true);
    r.setViewport(0, 0, this.eyeW, this.eyeH);
    r.setScissor(0, 0, this.eyeW, this.eyeH);
    r.render(scene, this.leftCamera);
    r.setViewport(this.eyeW, 0, this.eyeW, this.eyeH);
    r.setScissor(this.eyeW, 0, this.eyeW, this.eyeH);
    r.render(scene, this.rightCamera);
    r.setScissorTest(false);
    r.setViewport(0, 0, this.eyeW * 2, this.eyeH);
  }
}
