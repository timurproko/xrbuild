// The app's 3D icon: a blue sphere, flat in the panel's PNG and lit in 3D in the launcher.
import * as THREE from 'three';

export default function createIcon(): THREE.Object3D {
  return new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 32),
    new THREE.MeshStandardMaterial({ color: '#2f9bff', metalness: 0.1, roughness: 0.35 }),
  );
}
