import * as THREE from 'three';
import type { DisplayInfo } from './host.ts';
import { appResumeUrl, type CameraProjection } from './launch-context.ts';
import type { Interactor } from './interaction/core/interactor.ts';
import { PokeTarget } from './interaction/core/targets.ts';
import type { PanelFrame } from './stereo.ts';
import { play as playFeedback } from './ui-sound.ts';

const TRAVEL = 0.0045;
const CAP_DEPTH = 0.004;
const REST = 0.006;
const CAP_RADIUS = 0.0125;
const EDGE_MARGIN = 0.022;

function coverForNavigation(): number {
  if (typeof document === 'undefined') return 50;
  const cover = document.createElement('div');
  Object.assign(cover.style, {
    position: 'fixed', inset: '0', zIndex: '2147483647', pointerEvents: 'all',
    background: '#11161d', opacity: '0', transition: 'opacity 140ms ease-out',
  });
  document.documentElement.append(cover);
  requestAnimationFrame(() => { cover.style.opacity = '1'; });
  return 160;
}

/** Bevelled disc matching the UI kit's standard round button. */
function roundedDisc(radius: number, depth: number, segments = 64): THREE.BufferGeometry {
  const bevel = Math.min(depth * 0.3, radius * 0.5, 0.003);
  const r = radius - bevel;
  const points: THREE.Vector2[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector2(Math.cos(angle) * r, Math.sin(angle) * r));
  }
  const shape = new THREE.Shape(points);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, depth - 2 * bevel), bevelEnabled: true,
    bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: segments,
  });
  geometry.translate(0, 0, bevel);
  return geometry;
}

function material(color: THREE.ColorRepresentation, options: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05, depthTest: false, depthWrite: false, fog: false, ...options });
}

/** The SDK-owned launcher return control, attached to an app's existing scene and interaction runtime. */
export class ReturnControl {
  private readonly root = new THREE.Group();
  private readonly close = new THREE.Group();
  private readonly cap: THREE.Mesh;
  private readonly capMaterial: THREE.MeshStandardMaterial;
  private readonly poke: PokeTarget;
  private armed = false;
  private leaving = false;
  private lastFrameAt = 0;
  private shown = 0;
  private hover = 0;
  private projection: CameraProjection = 'perspective';

  private readonly returnUrl: string;
  private readonly interaction: Interactor;

  constructor(returnUrl: string, interaction: Interactor) {
    this.returnUrl = returnUrl;
    this.interaction = interaction;
    this.root.matrixAutoUpdate = false;
    const base = new THREE.Mesh(roundedDisc(CAP_RADIUS + 0.004, 0.004), material('#1b1f26'));
    this.capMaterial = material('#d6dbe3', { roughness: 0.35 });
    this.cap = new THREE.Mesh(roundedDisc(CAP_RADIUS, CAP_DEPTH), this.capMaterial);
    this.cap.position.z = REST;
    const markMaterial = new THREE.MeshBasicMaterial({ color: '#30363f', depthTest: false, depthWrite: false, fog: false });
    for (const angle of [Math.PI / 4, -Math.PI / 4]) {
      const stroke = new THREE.Mesh(new THREE.BoxGeometry(0.0078, 0.001, 0.0004), markMaterial);
      stroke.position.z = CAP_DEPTH + 0.0005;
      stroke.rotation.z = angle;
      stroke.renderOrder = 1_000_001;
      this.cap.add(stroke);
    }
    base.renderOrder = this.cap.renderOrder = 1_000_000;
    this.close.add(base, this.cap);
    this.root.add(this.close);

    this.poke = interaction.add(new PokeTarget(this.close, {
      inside: (x, y) => Math.hypot(x, y) < CAP_RADIUS,
      top: REST + CAP_DEPTH,
      travel: TRAVEL,
    }));
    this.poke.on((event) => {
      if (event.type === 'start') { this.armed = true; playFeedback('press'); }
      else if (event.type === 'end' && this.armed) { this.armed = false; playFeedback('release'); this.leave(); }
    });

  }

  /** Reparents and maps the control into this frame's physical panel before interaction runs. */
  attach(scene: THREE.Scene, panel: PanelFrame, display: DisplayInfo, projection: CameraProjection): void {
    if (this.root.parent !== scene) scene.add(this.root);
    this.projection = projection;
    this.close.position.set(display.widthM / 2 - EDGE_MARGIN, display.heightM / 2 - EDGE_MARGIN, 0.006);
    this.root.matrix.copy(panel.toWorld);
    this.root.updateMatrixWorld(true);
  }

  /** Updates UI-kit-style hover and press feedback after interaction has sampled this frame. */
  update(now: number): void {
    const dt = this.lastFrameAt ? Math.min(0.1, (now - this.lastFrameAt) / 1000) : 1 / 60;
    this.lastFrameAt = now;
    const depth = Math.max(0, this.poke.state.depth);
    this.shown = depth > this.shown ? depth : this.shown + (depth - this.shown) * (1 - Math.exp(-dt * 18));
    this.cap.position.z = REST - this.shown;
    const hoverTarget = Math.max(this.poke.state.proximity, this.poke.state.mouseOver ? 0.6 : 0);
    this.hover += (hoverTarget - this.hover) * (1 - Math.exp(-dt * 18));
    const pressed = this.poke.state.held;
    this.capMaterial.color.set('#d6dbe3').lerp(new THREE.Color('#5b8cff'), pressed ? 0.55 : this.hover * 0.25);
    this.capMaterial.emissive.set('#5b8cff').multiplyScalar(pressed ? 0.25 : this.hover * 0.08);
  }

  dispose(): void {
    this.interaction.remove(this.poke);
    this.root.removeFromParent();
  }

  leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    playFeedback('off');
    setTimeout(() => location.assign(appResumeUrl(this.returnUrl, this.projection)), coverForNavigation());
  }
}
