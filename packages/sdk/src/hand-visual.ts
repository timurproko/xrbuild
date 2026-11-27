// Hand rendering: translucent blue joint spheres (15 mm) and bone cylinders (15 mm thick),
// alpha 0.33; plus a white 30 mm sphere at the pinch centre while pinching or grabbing.
import * as THREE from 'three';
import { HAND_APPEARANCE_DEFAULTS, type HandAppearance } from './hand-profile.ts';
import type { Hand } from './hands.ts';
import type { PanelFrame } from './stereo.ts';
import { HandMeshVisual } from './hand-mesh-visual.ts';
import type { MeshDrawSurface } from './hand-mesh-protocol.ts';

const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];
const MAX_HANDS = 2;

export interface HandVisualStyle {
  /** joint sphere diameter, metres */
  jointDiameterM: number;
  /** bone cylinder diameter, metres */
  boneDiameterM: number;
  jointColor: THREE.ColorRepresentation;
  boneColor: THREE.ColorRepresentation;
  opacity: number;
  /** pinch-centre sphere diameter, metres (0 = off) */
  pinchDiameterM: number;
}

/** The default look. */
export const DEFAULT_HAND_STYLE: HandVisualStyle = {
  jointDiameterM: 0.015,
  boneDiameterM: 0.015,
  jointColor: new THREE.Color(0, 0.541, 1),
  boneColor: new THREE.Color(0, 0.482, 1),
  opacity: 0.333,
  pinchDiameterM: 0.03,
};

export class HandVisual extends THREE.Group {
  readonly style: HandVisualStyle;
  private readonly joints: THREE.InstancedMesh;
  private readonly bones: THREE.InstancedMesh;
  private readonly pinchSpheres: THREE.Mesh[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly boneUp = new THREE.Vector3(0, 1, 0);
  private readonly baseStyle: HandVisualStyle;
  private showJoints = true;
  private showBones = true;
  private showIndicator = true;
  private meshVisual: HandMeshVisual | null = null;
  updateMeshes(surfaces: MeshDrawSurface[], panel: PanelFrame): void {
    if (!this.meshVisual && !surfaces.length) return;
    if (!this.meshVisual) { this.meshVisual = new HandMeshVisual(); this.add(this.meshVisual); }
    this.meshVisual.update(surfaces, panel, this.style);
  }
  disposeMeshes(): void { this.meshVisual?.dispose(); this.meshVisual = null; }

  constructor(style: Partial<HandVisualStyle> = {}) {
    super();
    this.name = 'xrb-hands';
    this.style = { ...DEFAULT_HAND_STYLE, ...style };
    this.baseStyle = { ...this.style, jointColor: new THREE.Color(this.style.jointColor), boneColor: new THREE.Color(this.style.boneColor) };
    const mat = (color: THREE.ColorRepresentation, roughness: number) =>
      new THREE.MeshStandardMaterial({ color, transparent: true, opacity: this.style.opacity, roughness, metalness: 0, depthWrite: false });
    this.joints = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 16, 12), mat(this.style.jointColor, 0.5), MAX_HANDS * 21);
    this.bones = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1, true), mat(this.style.boneColor, 0.1), MAX_HANDS * BONES.length);
    for (const mesh of [this.joints, this.bones]) {
      mesh.frustumCulled = false;
      mesh.renderOrder = 20;
    }
    for (let i = 0; i < MAX_HANDS; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }));
      p.visible = false;
      p.renderOrder = 21;
      this.pinchSpheres.push(p);
    }
    this.add(this.joints, this.bones, ...this.pinchSpheres);
  }

  /** Drawing only: never changes input, gestures, panel mapping or interaction radii. */
  applyAppearance(overrides: Partial<HandAppearance> = {}): void {
    const a = { ...HAND_APPEARANCE_DEFAULTS, ...overrides };
    Object.assign(this.style, this.baseStyle);
    if (overrides.jointDiameterMm !== undefined) this.style.jointDiameterM = a.jointDiameterMm / 1000;
    if (overrides.boneDiameterMm !== undefined) this.style.boneDiameterM = a.boneDiameterMm / 1000;
    if (overrides.indicatorDiameterMm !== undefined) this.style.pinchDiameterM = a.indicatorDiameterMm / 1000;
    this.style.opacity = overrides.opacity ?? this.baseStyle.opacity;
    this.style.jointColor = overrides.jointColorLinear ? new THREE.Color(...a.jointColorLinear) : this.baseStyle.jointColor;
    this.style.boneColor = overrides.boneColorLinear ? new THREE.Color(...a.boneColorLinear) : this.baseStyle.boneColor;
    for (const [mesh, color] of [[this.joints, this.style.jointColor], [this.bones, this.style.boneColor]] as const) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.color.set(color); material.opacity = this.style.opacity;
    }
    this.showJoints = a.showJoints; this.showBones = a.showBones; this.showIndicator = a.showPinchGrabIndicator;
    this.joints.visible = this.showJoints; this.bones.visible = this.showBones;
    for (const pin of this.pinchSpheres) {
      const material = pin.material as THREE.MeshBasicMaterial;
      material.color.setRGB(...a.indicatorColorLinear); material.opacity = a.indicatorOpacity;
      if (!this.showIndicator) pin.visible = false;
    }
  }

  update(hands: Hand[], panel: PanelFrame): void {
    const k = panel.scale;
    const jd = this.style.jointDiameterM * k, bd = this.style.boneDiameterM * k;
    const shown = hands.slice(0, MAX_HANDS);
    let j = 0, b = 0;
    shown.forEach((hand, h) => {
      const world = hand.keypoints.map((p) => panel.pointToWorld(p, new THREE.Vector3()));
      for (const w of world) this.joints.setMatrixAt(j++, this.m.compose(w, this.q.identity(), this.s.setScalar(jd)));
      for (const [a, c] of BONES) {
        const dir = world[c].clone().sub(world[a]);
        const len = dir.length();
        if (len < 1e-6) continue;
        this.q.setFromUnitVectors(this.boneUp, dir.divideScalar(len));
        const mid = world[a].clone().add(world[c]).multiplyScalar(0.5);
        this.bones.setMatrixAt(b++, this.m.compose(mid, this.q, this.s.set(bd, len, bd)));
      }
      const pin = this.pinchSpheres[h];
      pin.visible = this.showIndicator && this.style.pinchDiameterM > 0 && (hand.pinching || hand.grabbing);
      if (pin.visible) {
        pin.position.copy(world[4]).add(world[8]).multiplyScalar(0.5);
        pin.scale.setScalar(this.style.pinchDiameterM * k);
      }
    });
    for (let h = shown.length; h < MAX_HANDS; h++) this.pinchSpheres[h].visible = false;
    this.joints.count = j;
    this.bones.count = b;
    this.joints.instanceMatrix.needsUpdate = true;
    this.bones.instanceMatrix.needsUpdate = true;
    this.visible = shown.length > 0;
  }
}
