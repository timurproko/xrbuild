// The kit's look and its interaction numbers. Everything is in metres: the app maps one
// scene unit to one metre of the panel (see main.ts), so these are physical sizes.
import * as THREE from 'three';

export const COLORS = {
  background: '#15181d',
  base: '#272c35',
  well: '#1b1f26',
  cap: '#d6dbe3',
  capDark: '#3b4352',
  track: '#2e3440',
  accent: '#5b8cff',
  text: '#e8ecf2',
  muted: '#8a94a6',
  done: '#5bd18b',
} as const;

/** Animation only: every interaction threshold lives in the SDK's DEFAULT_TUNING (metres). */
export const TUNING = {
  /** hover and press visuals ease with this rate (1/s) */
  ease: 18,
} as const;

export function material(color: THREE.ColorRepresentation, options: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05, ...options });
}

/** Rounded rectangle slab, centred in x/y, spanning z 0..depth (its front face at z = depth). */
export function roundedBox(width: number, height: number, depth: number, radius: number, maxBevel = 0.003): THREE.BufferGeometry {
  const bevel = Math.min(depth * 0.3, radius * 0.5, maxBevel);
  const w = width - 2 * bevel, h = height - 2 * bevel;
  const r = Math.max(0.0005, Math.min(radius - bevel, w / 2, h / 2));
  const x = -w / 2, y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(1e-4, depth - 2 * bevel), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 12,
  });
  g.translate(0, 0, bevel);
  return g;
}

/** Disc with the same bevelled edge as roundedBox, centred in x/y, spanning z 0..depth. */
export function roundedDisc(radius: number, depth: number, segments = 64): THREE.BufferGeometry {
  const bevel = Math.min(depth * 0.3, radius * 0.5, 0.003);
  // Explicit points, not absarc(0..2pi): the arc's end point lands a rounding error away from its
  // start, and that near-duplicate corner at angle 0 breaks the bevel on the right edge.
  const r = radius - bevel;
  const points: THREE.Vector2[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  const s = new THREE.Shape(points);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(1e-4, depth - 2 * bevel), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: segments,
  });
  g.translate(0, 0, bevel);
  return g;
}

/**
 * Frosted glass (visionOS-style sheet): the scene behind shows through, blurred. three.js renders a
 * transmission pass per eye for it, so keep glass surfaces few and large.
 */
export function glass(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: '#e6edf8', transmission: 1, roughness: 0.62, thickness: 0.012, ior: 1.4, metalness: 0,
    specularIntensity: 0.5, envMapIntensity: 1, side: THREE.FrontSide,
  });
}

/** Disc facing the viewer (+z), spanning z 0..depth. */
export function disc(radius: number, depth: number, segments = 48): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(radius, radius, depth, segments).rotateX(Math.PI / 2).translate(0, 0, depth / 2);
}

/** Exponential approach: frame-rate independent easing toward a target. */
export const approach = (current: number, target: number, dt: number, rate: number = TUNING.ease): number =>
  current + (target - current) * (1 - Math.exp(-rate * dt));
