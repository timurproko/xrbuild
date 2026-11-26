import * as THREE from 'three';
import type { MeshSurface } from './hand-mesh-protocol.ts';
import type { PanelFrame } from './stereo.ts';
import type { HandVisualStyle } from './hand-visual.ts';

/** Lazy drawing child: the no-plugin visual retains its exact original children/materials. */
export class HandMeshVisual extends THREE.Group {
  private material = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, roughness: .5, side: THREE.DoubleSide });
  private records = new Map<number, { surface: MeshSurface; mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> }>();
  constructor() { super(); this.name = 'xrb-hand-mesh'; this.matrixAutoUpdate = false; }
  update(surfaces: MeshSurface[], panel: PanelFrame, style: HandVisualStyle): void {
    this.matrix.copy(panel.toWorld); this.matrixWorldNeedsUpdate = true;
    this.material.color.set(style.boneColor); this.material.opacity = style.opacity;
    const ids = new Set(surfaces.map(s => s.id));
    for (const [id, r] of this.records) if (!ids.has(id)) { r.mesh.geometry.dispose(); this.remove(r.mesh); this.records.delete(id); }
    for (const surface of surfaces) {
      let record = this.records.get(surface.id);
      if (record && (record.surface.topology !== surface.topology || record.surface.positions.length !== surface.positions.length)) {
        record.mesh.geometry.dispose(); this.remove(record.mesh); this.records.delete(surface.id); record = undefined;
      }
      if (!record) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(surface.positions.length), 3).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(surface.positions.length), 3).setUsage(THREE.DynamicDrawUsage));
        geometry.setIndex(new THREE.BufferAttribute(surface.indices, 1));
        const mesh = new THREE.Mesh(geometry, this.material); mesh.frustumCulled = false; mesh.renderOrder = 19;
        record = { mesh, surface: { ...surface, positions: new Float32Array() } }; this.records.set(surface.id, record); this.add(mesh);
      }
      if (record.surface.positions !== surface.positions) {
        const geometry = record.mesh.geometry, positions = geometry.getAttribute('position') as THREE.BufferAttribute;
        positions.copyArray(surface.positions); positions.needsUpdate = true;
        if (surface.normals) { const normal = geometry.getAttribute('normal') as THREE.BufferAttribute; normal.copyArray(surface.normals); normal.needsUpdate = true; }
        else geometry.computeVertexNormals();
        record.surface = surface;
      }
    }
    this.visible = surfaces.length > 0;
  }
  dispose(): void { for (const r of this.records.values()) r.mesh.geometry.dispose(); this.records.clear(); this.clear(); this.material.dispose(); this.removeFromParent(); }
}
