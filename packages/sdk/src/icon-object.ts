// 3D app icon: an app's `src/icon.js` default-exports createIcon(), which returns a three.js object. The build
// emits it as `icon.js` next to index.html (an ES module whose chunks load relative to it), so a launcher can import it from the
// app's route and show it in 3D, and the app's icon view draws the same object straight-on (orthographic), which
// makes the PNG icon a flat render of it. The object may animate itself in launchers with `userData.update(seconds)`
// (the icon view holds still: it changes only when the developer turns or zooms it), and set
// `userData.ready` to a promise when it loads textures first (the icon view signals ready after it).
//
// The object can come from another copy of three.js (the icon module bundles its own): everything here only
// uses traversal, geometry bounds and the renderer's flag checks, which work across copies.
import * as THREE from 'three';

/** The default export of an app's `icon.js`. */
export type IconFactory = () => THREE.Object3D | Promise<THREE.Object3D>;

/** Calls the icon's idle motion, when it has one. */
export function updateIcon(object: THREE.Object3D, seconds: number): void {
  const update = object.userData?.update;
  if (typeof update === 'function') update(seconds);
}

/**
 * Wraps an icon object so it is centred on the origin and fits a sphere of `diameter` (scene units):
 * consumers place and scale the wrapper without knowing the icon's own size.
 */
export function fitIcon(object: THREE.Object3D, diameter = 1): THREE.Group {
  const sphere = boundingSphere(object);
  const wrapper = new THREE.Group();
  wrapper.name = 'xrb-icon';
  const radius = sphere.radius > 0 && Number.isFinite(sphere.radius) ? sphere.radius : 0.5;
  wrapper.scale.setScalar(diameter / (2 * radius));
  object.position.sub(sphere.center);
  wrapper.add(object);
  return wrapper;
}

/**
 * Icon studio controls on the icon's canvas: drag to turn, middle-drag to pan, right-drag or scroll to zoom (up / away:
 * closer).
 * `changed` runs after each change, e.g. to redraw while the preview is paused. Returns a function that removes
 * the controls.
 */
export function iconControls(canvas: HTMLElement, stage: IconStage, size: number, changed: () => void = () => {}): () => void {
  // Left button turns, middle pans, right zooms.
  const MODES: Record<number, 'turn' | 'pan' | 'zoom'> = { 0: 'turn', 1: 'pan', 2: 'zoom' };
  let last: { x: number; y: number; mode: 'turn' | 'pan' | 'zoom' } | null = null;
  const down = (e: PointerEvent) => {
    const mode = MODES[e.button];
    if (!mode) return;
    if (mode === 'pan') e.preventDefault();  // no auto-scroll on the middle button
    last = { x: e.clientX, y: e.clientY, mode };
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!last) return;
    const dx = e.clientX - last.x, dy = e.clientY - last.y;
    if (last.mode === 'zoom') stage.zoom(Math.exp(-dy / size * 2));
    else if (last.mode === 'pan') stage.pan(dx, dy, size);
    else stage.turn(dx, dy, size);
    last = { x: e.clientX, y: e.clientY, mode: last.mode };
    changed();
  };
  const up = () => { last = null; };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    stage.zoom(Math.exp(-e.deltaY / 500));
    changed();
  };
  const menu = (e: Event) => e.preventDefault();
  // The icon is a picture to frame, not app UI: a plain arrow, never the app's hover cursor.
  canvas.style.cursor = 'default';
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('contextmenu', menu);
  return () => {
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up);
    canvas.removeEventListener('wheel', wheel);
    canvas.removeEventListener('contextmenu', menu);
  };
}

/**
 * The object's tight bounding sphere: centred on its box, reaching its farthest vertex. The box's own sphere
 * reaches the box corners, which leaves a round icon at about 60 % of the frame.
 */
function boundingSphere(object: THREE.Object3D): THREE.Sphere {
  object.updateMatrixWorld(true);
  const center = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
  const v = new THREE.Vector3();
  let radius2 = 0;
  object.traverseVisible((node) => {
    const position = (node as THREE.Mesh).geometry?.attributes?.position;
    if (!position) return;
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld);
      radius2 = Math.max(radius2, v.distanceToSquared(center));
    }
  });
  return new THREE.Sphere(center, Math.sqrt(radius2));
}

/**
 * Imports an app's 3D icon from its route (`<route>/icon.js`) and returns the fitted object, or null when the app
 * has none or it fails: the caller then shows the PNG icon.
 */
export async function loadAppIcon(route: string | URL, diameter = 1): Promise<THREE.Group | null> {
  try {
    const mod = await import(/* @vite-ignore */ new URL('icon.js', route).href) as { default?: unknown; createIcon?: unknown };
    const create = (mod.default ?? mod.createIcon) as IconFactory | undefined;
    if (typeof create !== 'function') return null;
    const object = await create();
    return object ? fitIcon(object, diameter) : null;
  } catch {
    return null;
  }
}

/**
 * The icon view's stage: the icon object alone, lit, fitted with a small margin into an orthographic camera
 * looking down -Z. It holds still (the idle motion is for launchers); in the icon studio the developer turns and
 * zooms it (iconControls).
 */
export class IconStage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.01, 10);
  readonly pivot: THREE.Group;
  /** settles when the object's own loading (`userData.ready`) is done */
  readonly ready: Promise<void>;

  constructor(object: THREE.Object3D, margin = 0.06) {
    this.ready = Promise.resolve(object.userData?.ready).then(() => {}, () => {});
    this.pivot = fitIcon(object, 1 - 2 * margin);
    this.scene.add(this.pivot);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-1, 1.5, 2);
    this.scene.add(key);
    this.camera.position.set(0, 0, 3);
    this.camera.lookAt(0, 0, 0);
  }

  /** Turns the object by a pointer drag (pixels over a square of `size`). */
  turn(dx: number, dy: number, size: number): void {
    this.pivot.rotation.y += (dx / size) * Math.PI;
    this.pivot.rotation.x = THREE.MathUtils.clamp(this.pivot.rotation.x + (dy / size) * Math.PI, -Math.PI / 2, Math.PI / 2);
  }

  /** Zooms the view by `factor` (> 1: closer), between 0.5x and 4x. */
  zoom(factor: number): void {
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * factor, 0.5, 4);
    this.camera.updateProjectionMatrix();
  }

  /** Moves the view with a pointer drag (pixels over a square of `size`): the icon follows the pointer. */
  pan(dx: number, dy: number, size: number): void {
    const units = 1 / (size * this.camera.zoom);  // the frame is 1 unit wide at zoom 1
    this.camera.position.x -= dx * units;
    this.camera.position.y += dy * units;
  }

  /** Back to the starting view: no turn, no pan, no zoom. */
  reset(): void {
    this.pivot.rotation.set(0, 0, 0);
    this.camera.position.set(0, 0, 3);
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
  }

  /** Draws the icon in its current pose; it changes only by turn, zoom and reset, so every Take matches the view. */
  draw(renderer: THREE.WebGLRenderer): void {
    renderer.setClearColor(0x000000, 0);
    renderer.render(this.scene, this.camera);
  }
}
