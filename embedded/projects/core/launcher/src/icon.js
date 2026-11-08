// The launcher's 3D icon: a small rocket. Other launchers show it in 3D; the icon view renders it straight-on as
// the PNG icon.
import * as THREE from 'three';

export default function createIcon() {
  const rocket = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: '#e8edf7', metalness: 0.25, roughness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: '#4d7cff', metalness: 0.2, roughness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: '#7fd4ff', emissive: '#1d5a8a', metalness: 0.1, roughness: 0.15 });
  const flame = new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9 });

  // Body: a lathe profile from the tail to the nose.
  const profile = [[0, -1], [0.34, -1], [0.42, -0.6], [0.44, 0], [0.4, 0.45], [0.28, 0.85], [0.12, 1.12], [0, 1.22]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  rocket.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 48), hull));
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.4), accent);
  nose.position.y = 1.02;
  rocket.add(nose);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.445, 0.445, 0.12, 48), accent);
  band.position.y = -0.2;
  rocket.add(band);

  const porthole = new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), glass);
  porthole.position.set(0, 0.35, 0.425);
  porthole.rotation.x = -0.12;
  rocket.add(porthole);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 12, 32), accent);
  rim.position.copy(porthole.position);
  rim.rotation.x = -0.12;
  rocket.add(rim);

  // Three fins around the tail.
  const finShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.38, -0.32), new THREE.Vector2(0.38, -0.6), new THREE.Vector2(0, -0.42)]);
  const finGeometry = new THREE.ExtrudeGeometry(finShape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 });
  finGeometry.translate(0, 0, -0.03);
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(finGeometry, accent);
    fin.position.y = -0.45;
    fin.rotation.y = (i / 3) * Math.PI * 2 + Math.PI / 2;
    fin.translateX(0.36);
    rocket.add(fin);
  }

  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.14, 32), new THREE.MeshStandardMaterial({ color: '#59607a', metalness: 0.6, roughness: 0.3 }));
  nozzle.position.y = -1.06;
  rocket.add(nozzle);
  const fire = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 24), flame);
  fire.rotation.x = Math.PI;
  fire.position.y = -1.36;
  rocket.add(fire);

  // Tilted for flight; it bobs and the flame flickers.
  const icon = new THREE.Group();
  icon.add(rocket);
  rocket.rotation.z = -Math.PI / 5;
  icon.userData.update = (seconds) => {
    rocket.position.y = Math.sin(seconds * 1.6) * 0.05;
    rocket.rotation.y = seconds * 0.6;
    fire.scale.y = 0.85 + Math.sin(seconds * 23) * 0.12;
  };
  return icon;
}
