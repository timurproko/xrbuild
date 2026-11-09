// The app's 3D icon: a launcher shows this object in 3D, and the icon view renders it straight-on
// (orthographic) as the app's PNG icon. Return any three.js object; `userData.update(seconds)` animates it.
import * as THREE from 'three';
import { iconTheme } from './icon-theme.js';

export default function createIcon() {
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 32),
    new THREE.MeshStandardMaterial({ color: iconTheme.icon, metalness: 0.1, roughness: 0.35 }),
  );
  return sphere;
}
