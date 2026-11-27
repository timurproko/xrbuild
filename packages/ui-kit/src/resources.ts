import type * as THREE from 'three';

type Resource = { dispose(): void };
const retired = new WeakSet<Resource>();

/** Own only construction-time resources, never content later supplied by a consumer. */
export class VisualResources {
  private readonly resources = new Set<Resource>();
  private disposed = false;

  capture(root: THREE.Object3D, ownTextures = true): void {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) this.add(mesh.geometry);
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) if (material) {
        this.add(material);
        for (const value of ownTextures ? Object.values(material) : []) {
          if (value && typeof value === 'object' && 'isTexture' in value && value.isTexture) this.add(value as THREE.Texture);
        }
      }
    });
  }

  add(resource: Resource): void { this.resources.add(resource); }

  replace(previous: Resource, next: Resource): void {
    this.resources.delete(previous);
    previous.dispose();
    this.add(next);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const resource of this.resources) if (!retired.has(resource)) {
      retired.add(resource);
      resource.dispose();
    }
    this.resources.clear();
  }
}
