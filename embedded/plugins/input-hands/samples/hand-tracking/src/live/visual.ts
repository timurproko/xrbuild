import * as THREE from 'three';
import { BONES, type Observation, type Point } from './contracts.ts';
/** Display layout only: each hand is centered and separated, never positioned in panel/camera metres. */
export function relativeViewPoint(point: Point, index: number, count: number): THREE.Vector3 {
  return new THREE.Vector3(point.x + (count > 1 ? (index === 0 ? -0.13 : 0.13) : 0), -point.y, -point.z + 0.06);
}
export class RelativeSkeleton extends THREE.Group {
  readonly joints = new THREE.InstancedMesh(new THREE.SphereGeometry(0.003, 12, 8), new THREE.MeshStandardMaterial({ color: '#74e7d5' }), 42);
  readonly bones = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.002, 0.002, 1, 8), new THREE.MeshStandardMaterial({ color: '#36aad7' }), BONES.length * 2);
  private readonly axes = [new THREE.AxesHelper(0.04), new THREE.AxesHelper(0.04)];
  private transformScratch = new THREE.Matrix4();
  private quaternionScratch = new THREE.Quaternion();
  private upAxis = new THREE.Vector3(0, 1, 0);
  constructor() {
    super(); this.add(this.joints, this.bones, ...this.axes);
    this.joints.frustumCulled = this.bones.frustumCulled = false;
    this.update([]);
  }
  update(observations: readonly Observation[], showAxes = true): void {
    const hands = observations.filter(hand => hand.relative).slice(0, 2).sort((a,b) => a.id - b.id);
    let j = 0, b = 0;
    hands.forEach((hand, h) => {
      const points = hand.relative!.map(point => relativeViewPoint(point, h, hands.length));
      for (const point of points) this.joints.setMatrixAt(j++, this.transformScratch.compose(point, this.quaternionScratch.identity(), new THREE.Vector3(1,1,1)));
      for (const [a,c] of BONES) {
        const direction = points[c].clone().sub(points[a]), length = direction.length();
        if (length < 1e-7) continue;
        this.quaternionScratch.setFromUnitVectors(this.upAxis, direction.divideScalar(length));
        this.bones.setMatrixAt(b++, this.transformScratch.compose(points[a].clone().add(points[c]).multiplyScalar(0.5), this.quaternionScratch, new THREE.Vector3(1,length,1)));
      }
      this.axes[h].position.copy(points[0]);
    });
    this.axes.forEach((axis, i) => { axis.visible = showAxes && i < hands.length; });
    this.joints.count = j; this.bones.count = b;
    this.joints.instanceMatrix.needsUpdate = this.bones.instanceMatrix.needsUpdate = true;
    this.visible = hands.length > 0;
  }
}
export function drawOverlay(canvas: HTMLCanvasElement, image: CanvasImageSource & { width: number; height: number }, hands: readonly Observation[]): void {
  if (canvas.width !== image.width || canvas.height !== image.height) { canvas.width = image.width; canvas.height = image.height; }
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  ctx.lineWidth = Math.max(2, canvas.width / 260);
  hands.forEach((hand, index) => {
    ctx.strokeStyle = ctx.fillStyle = index === 0 ? '#45ffce' : '#ffb0e5';
    for (const [a,b] of BONES) { ctx.beginPath(); ctx.moveTo(hand.image[a].x * canvas.width, hand.image[a].y * canvas.height); ctx.lineTo(hand.image[b].x * canvas.width, hand.image[b].y * canvas.height); ctx.stroke(); }
    for (const point of hand.image) { ctx.beginPath(); ctx.arc(point.x * canvas.width, point.y * canvas.height, Math.max(2.5, canvas.width / 180), 0, Math.PI * 2); ctx.fill(); }
  });
}
