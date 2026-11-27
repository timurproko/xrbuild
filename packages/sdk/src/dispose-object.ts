import * as THREE from 'three';

/** Releases an SDK-owned visual, never an application scene or borrowed primitive. */
export function disposeObject(object: THREE.Object3D): void {
  const resources = new Set<{ dispose(): void }>();
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) resources.add(mesh.geometry);
    for (const material of mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []) {
      resources.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
    }
    if (child instanceof THREE.InstancedMesh) resources.add(child);
  });
  for (const resource of resources) resource.dispose();
  object.removeFromParent();
}
