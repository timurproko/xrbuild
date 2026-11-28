// Accent: solid controls in one accent colour with soft, filleted edges and a satin finish. Round buttons are
// pucks, pill buttons capsules, slider thumbs upright capsules with one white line; the slider fills inside a dark channel.
// Shapes only change inside each role's authored bounds; targets, layout and interaction stay untouched.
import * as THREE from 'three';
import { sampleHead, SAMPLE_HEAD_HALF } from './sample-head.ts';
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
/** The one white line on a slider thumb: the dial pointer's exact size and round ends (dial R 0.022, pointer R/2 long). */
// Its height stays within the reference ridge's envelope (0.0012 centred on the thumb face), as every recipe must.
/**
 * The standard dial knob (radius 0.022) grows to about the round Button's radius (0.025): 0.024, the most its
 * rotating square bounds allow inside the dial's footprint. Smaller dials scale with it.
 */
const DIAL_TO_ROUND = 0.024 / 0.022;
/** The slider thumb widens from 0.022 to 0.027 m; its 0.032 m height is already the slider's full footprint height. */
const THUMB_WIDEN = 0.027 / 0.022;
/** The switch thumb (radius 0.0115) fills its capsule track (radius 0.015) with an even 1.5 mm rim. */
const SWITCH_FILL = 0.0135 / 0.0115;
const MARK_W = 0.00205, MARK_L = 0.011, MARK_D = 0.0006;

/** The controls stand on their own, as in the reference kit: no recessed wells under them. */
const wellRoles = new Set<VisualRole>(['buttonWellPill', 'buttonWellRound', 'dialWell']);
/** The trackball model is the sample head alone (the trackball's own dot shell shows while it turns); the mascot's other parts are not drawn. */
const hiddenRobotRoles = new Set<VisualRole>(['robotSocket', 'robotEye', 'robotNose', 'robotAntenna', 'robotTip', 'robotEar']);
const flatRoles = new Set<VisualRole>(['dialogPane', 'dialogFilm', 'glassEdge', 'label', 'icon', 'touchCursor']);
function geometry(role: VisualRole, input: GeometryInput): THREE.BufferGeometry {
  const a = input.args;
  if (wellRoles.has(role) || hiddenRobotRoles.has(role)) return new THREE.BufferGeometry();
  if (role === 'robotHead') {
    // The trackball model: the sample head facing the viewer, about as wide as the mascot it replaces with its ears.
    const fit = (a[0] * 1.45) / SAMPLE_HEAD_HALF.x;
    return sampleHead().scale(fit, fit, fit);
  }
  if (flatRoles.has(role)) return referenceGeometry(input);
  let result: THREE.BufferGeometry;
  // The switch belongs to the button family: a capsule track like the pill Button and a puck knob like the round one.
  switch (input.shape) {
    case 'box': {
      const [w, h, d, r = Math.min(w, h) / 2] = a;
      // The slider thumb is an upright capsule, the pill Button's shape turned on end; its one mark is the grip line below.
      result = role === 'sliderHandle' ? slab(w * THUMB_WIDEN, h, d, Math.min(w * THUMB_WIDEN, h) / 2) : slab(w, h, d, r);
      break;
    }
    case 'roundedDisc': result = puck(a[0] * (role === 'dialKnob' ? DIAL_TO_ROUND : role === 'switchKnob' ? SWITCH_FILL : 1), a[1]); break;
    case 'disc': {
      result = puck(a[0], a[1]);
      // A dot on the dial's ring moves out to the edge of the dial's footprint, clear of the larger knob.
      if (role === 'dialTick' && a.length >= 6) { const [r, , , angle, ring, outer] = a, out = outer - r - 0.0001 - ring; result.translate(Math.cos(angle) * out, Math.sin(angle) * out, 0); }
      break;
    }
    // Of the three grip ridges only the middle one stays: one white line, the size of the dial's pointer.
    case 'plainBox': result = a[3] === 0 ? slab(MARK_W, MARK_L, MARK_D, MARK_W / 2) : new THREE.BufferGeometry(); break;
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
    if (role === 'sliderFill') authored.color.set(FILL);
    if (role === 'sliderGrip') { authored.color.set(COLORS.onCap); authored.roughness = 0.4; authored.metalness = 0; }
    // Marks drawn on a body (the dial's pointer) use the same white ink as button text.
    if (role === 'dialPointer') { authored.color.set(COLORS.onCap); authored.roughness = 0.4; authored.metalness = 0; }
  }
  // The head keeps the trackball's own faceted shell material (flat shading, its colour and enabled/disabled fade).
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
