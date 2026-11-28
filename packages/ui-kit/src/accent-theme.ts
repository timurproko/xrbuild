// Accent: solid controls in one accent colour with soft, filleted edges and a satin finish. Round buttons are
// pucks, pill buttons capsules, slider handles ribbed grips with a marker line, and the slider track a pale bar.
// Shapes only change inside each role's authored bounds; targets, layout and interaction stay untouched.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { referenceGeometry, type GeometryInput, type UiKitTheme, type VisualRole, type VisualRecipe } from './visual-theme.ts';

const ACCENT = '#4a7dff';
const COLORS = {
  background: '#15181d', base: '#262c36', well: '#1a1e25',
  // Bodies are the accent; hover and press tint them toward a lighter accent.
  cap: ACCENT, capDark: '#2f4f9e', track: '#39414f', accent: '#8fb0ff',
  text: '#e8ecf2', muted: '#8a94a6', done: '#5bd18b', onCap: '#ffffff',
} as const;
/** The slider fill: half accent, half white, so it is never a flat, harsh accent. */
const FILL = new THREE.Color(ACCENT).lerp(new THREE.Color('#ffffff'), 0.5).getStyle();
const TRACK = '#d3dcef';

/** A rounded rectangle extruded along +z (0..depth) with a smooth fillet on its front and back edges. */
function slab(w: number, h: number, depth: number, radius: number): THREE.BufferGeometry {
  const f = Math.max(0.00005, Math.min(depth * 0.32, 0.0014, w * 0.2, h * 0.2));
  // Corners stop just short of meeting, so a capsule never has zero-length edges (those spike the extrusion).
  const hw = w / 2 - f, hh = h / 2 - f, r = Math.max(0, Math.min(radius - f, hw * 0.999, hh * 0.999));
  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hh); shape.lineTo(hw - r, -hh); shape.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(hw, hh - r); shape.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-hw + r, hh); shape.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-hw, -hh + r); shape.absarc(-hw + r, -hh + r, r, Math.PI, Math.PI * 1.5, false);
  // Repeated outline points (arc ends meeting line ends, and the closing point) make the extrusion spike.
  const points: THREE.Vector2[] = [];
  for (const point of shape.getPoints(24)) if (!points.length || point.distanceTo(points[points.length - 1]) > 1e-7) points.push(point);
  if (points.length > 2 && points[0].distanceTo(points[points.length - 1]) <= 1e-7) points.pop();
  return new THREE.ExtrudeGeometry(new THREE.Shape(points), { depth: Math.max(0.00001, depth - 2 * f), bevelEnabled: true, bevelThickness: f, bevelSize: f, bevelSegments: 4, curveSegments: 24 })
    .translate(0, 0, f);
}
/** A puck: flat face, straight side and a quarter-round fillet into the face, turned about z (0..depth). */
function puck(radius: number, depth: number): THREE.BufferGeometry {
  const f = Math.max(0.00005, Math.min(depth * 0.4, radius * 0.18, 0.0016)), points = [new THREE.Vector2(0, 0), new THREE.Vector2(radius, 0)];
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; points.push(new THREE.Vector2(radius - f + Math.cos(a) * f, depth - f + Math.sin(a) * f)); }
  points.push(new THREE.Vector2(0, depth));
  // Lathe turns about y; the controls' depth axis is z.
  return new THREE.LatheGeometry(points, 64).rotateX(Math.PI / 2);
}
function joined(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const result = mergeGeometries(parts.map(part => part.index ? part.toNonIndexed() : part), false);
  for (const geometry of parts) geometry.dispose();
  if (!result) throw new Error('Incompatible Accent geometry');
  return result;
}
/** The slider grip: a filleted block with raised ribs across its face, like a knurled knob. */
function ribbed(w: number, h: number, depth: number, radius: number): THREE.BufferGeometry {
  const ribs = 5, pitch = w / (ribs + 1), ribW = Math.min(0.0009, pitch * 0.35), ribD = Math.min(0.0005, depth * 0.12);
  const parts = [slab(w, h, depth, radius)];
  for (let i = 1; i <= ribs; i++) if (i !== (ribs + 1) / 2) parts.push(slab(ribW, h * 0.78, ribD, ribW / 2).translate(-w / 2 + i * pitch, 0, depth - ribD * 0.4));
  return joined(parts);
}

const ribbedRoles = new Set<VisualRole>(['sliderHandle']);
const flatRoles = new Set<VisualRole>(['dialogPane', 'dialogFilm', 'glassEdge', 'label', 'icon', 'touchCursor']);
function geometry(role: VisualRole, input: GeometryInput): THREE.BufferGeometry {
  const a = input.args;
  if (flatRoles.has(role) || role.startsWith('robot')) return referenceGeometry(input);
  let result: THREE.BufferGeometry;
  switch (input.shape) {
    case 'box': {
      const [w, h, d, r = Math.min(w, h) / 2] = a;
      result = ribbedRoles.has(role) ? ribbed(w, h, d, Math.min(r, 0.0035)) : slab(w, h, d, r);
      break;
    }
    case 'roundedDisc': result = puck(a[0], a[1]); break;
    case 'disc': result = puck(a[0], a[1]); break;
    // Of the three grip ridges only the middle one stays, as the handle's marker line.
    case 'plainBox': result = a[3] === 0 ? slab(0.0011, a[1], 0.0006, 0.00055) : new THREE.BufferGeometry(); break;
    case 'torus': result = new THREE.TorusGeometry(a[0], a[1], 12, 128); break;
    default: return referenceGeometry(input);
  }
  return input.finish ? input.finish(result) : result;
}

const solidRoles = new Set<VisualRole>(['buttonPill', 'buttonRound', 'switchKnob', 'segmentCap', 'sliderHandle', 'dialKnob']);
function material(role: VisualRole, authored: THREE.Material): THREE.Material {
  if (authored instanceof THREE.MeshStandardMaterial && !(authored instanceof THREE.MeshPhysicalMaterial) && !role.startsWith('robot')) {
    // Satin: a soft highlight that reads as a finished surface without an environment map.
    authored.roughness = solidRoles.has(role) ? 0.3 : 0.55;
    authored.metalness = solidRoles.has(role) ? 0.22 : 0.08;
    if (role === 'sliderTrack') authored.color.set(TRACK);
    if (role === 'sliderFill') authored.color.set(FILL);
    if (role === 'sliderGrip') { authored.color.set(COLORS.onCap); authored.roughness = 0.4; authored.metalness = 0; }
  }
  return authored;
}

export function createAccentTheme(reference: UiKitTheme, roles: readonly VisualRole[]): UiKitTheme {
  return Object.freeze({
    id: 'accent', colors: Object.freeze({ ...COLORS }),
    // Identical line metrics keep captions and consumer layouts stable.
    typography: Object.freeze({ ...reference.typography }),
    icon: Object.freeze({ stroke: 2.2, lineCap: 'round', lineJoin: 'round' }),
    visuals: Object.freeze(Object.fromEntries(roles.map(role => [role, Object.freeze({
      geometry: (input: GeometryInput) => geometry(role, input), material: (authored: THREE.Material) => material(role, authored),
    })])) as Record<VisualRole, VisualRecipe>),
  });
}
