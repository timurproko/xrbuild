import type * as THREE from 'three';

/** Owned disposers, run once in reverse acquisition order, including after partial setup failure. */
export class Lifetime {
  private callbacks: (() => void)[] = [];
  private closed = false;
  own(dispose: () => void): void {
    if (this.closed) dispose(); else this.callbacks.push(dispose);
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    const errors: unknown[] = [];
    for (const dispose of this.callbacks.splice(0).reverse()) {
      try { dispose(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Hand Tracking cleanup failed');
  }
}

/** Shared geometries/materials/textures must be released once, not once per mesh. */
export function disposeScene(root: THREE.Object3D): void {
  const resources = new Set<{ dispose(): void }>();
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if ((object as THREE.InstancedMesh).isInstancedMesh) resources.add(object as THREE.InstancedMesh);
    if (mesh.geometry) resources.add(mesh.geometry);
    const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const material of materials) {
      resources.add(material);
      for (const value of Object.values(material)) if (value && typeof value === 'object' && 'isTexture' in value && value.isTexture) resources.add(value as THREE.Texture);
    }
  });
  for (const resource of resources) resource.dispose();
  root.clear();
}
