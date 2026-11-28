import * as THREE from 'three';
import { COLORS, roundedBox, roundedDisc, disc } from './theme.ts';
import { createChamferTheme } from './chamfer-theme.ts';

/** Visual roles are deliberately independent of target bounds and interaction tuning. */
export const visualRoles = [
  'board', 'buttonPill', 'buttonRound', 'buttonWellPill', 'buttonWellRound',
  'switchTrack', 'switchKnob', 'segmentWell', 'segmentCap', 'sliderTrack', 'sliderFill',
  'sliderHandle', 'sliderGrip', 'sliderDetent', 'dialWell', 'dialKnob', 'dialPointer', 'dialTick',
  'robotHead', 'robotSocket', 'robotEye', 'robotNose', 'robotAntenna', 'robotTip', 'robotEar',
  'trackballRing', 'trackballShell', 'dialogPane', 'dialogFilm', 'glassEdge', 'label', 'icon', 'touchCursor',
] as const;
export type VisualRole = typeof visualRoles[number];
export interface GeometryInput {
  readonly shape: 'box' | 'plainBox' | 'circle' | 'roundedDisc' | 'disc' | 'ring' | 'plane' | 'sphere' | 'ico' | 'torus' | 'cylinder' | 'cone' | 'empty';
  readonly args: readonly number[];
  /** Original geometry-local orientation, never the control's interaction frame. */
  readonly finish?: (geometry: THREE.BufferGeometry) => THREE.BufferGeometry;
}
export interface VisualRecipe {
  geometry(input: GeometryInput): THREE.BufferGeometry;
  /** Receives an owned, disposable copy of the authored material, including caller overrides. */
  material(authored: THREE.Material): THREE.Material;
}
export interface UiKitTheme {
  readonly id: string;
  readonly colors: { readonly [K in keyof typeof COLORS]: string };
  readonly typography: { readonly family: string; readonly weight: number; readonly color: string };
  readonly icon: { readonly stroke: number; readonly lineCap: CanvasLineCap; readonly lineJoin: CanvasLineJoin };
  readonly visuals: Readonly<Record<VisualRole, VisualRecipe>>;
}
export type UiKitThemeId = 'default' | 'chamfer';
export type UiKitThemeSelection = UiKitThemeId | UiKitTheme;
export interface ThemeOptions { theme?: UiKitThemeSelection }

export function referenceGeometry(input: GeometryInput): THREE.BufferGeometry {
  const a = input.args;
  let geometry: THREE.BufferGeometry;
  switch (input.shape) {
    case 'plainBox': geometry = new THREE.BoxGeometry(a[0], a[1], a[2]); break;
    case 'box': geometry = roundedBox(a[0], a[1], a[2], a[3], a[4]); break;
    case 'roundedDisc': geometry = roundedDisc(a[0], a[1], a[2]); break;
    case 'disc': geometry = disc(a[0], a[1], a[2]); break;
    case 'circle': geometry = new THREE.CircleGeometry(a[0], a[1]); break;
    case 'ring': geometry = new THREE.RingGeometry(a[0], a[1], a[2]); break;
    case 'plane': geometry = new THREE.PlaneGeometry(a[0], a[1]); break;
    case 'sphere': geometry = new THREE.SphereGeometry(a[0], a[1], a[2]); break;
    case 'ico': geometry = new THREE.IcosahedronGeometry(a[0], a[1]); break;
    case 'torus': geometry = new THREE.TorusGeometry(a[0], a[1], a[2], a[3]); break;
    case 'cylinder': geometry = new THREE.CylinderGeometry(a[0], a[1], a[2], a[3]); break;
    case 'cone': geometry = new THREE.ConeGeometry(a[0], a[1], a[2]); break;
    case 'empty': geometry = new THREE.BufferGeometry(); break;
  }
  return input.finish ? input.finish(geometry) : geometry;
}
const referenceRecipe: VisualRecipe = Object.freeze({ geometry: referenceGeometry, material: (authored: THREE.Material) => authored });
export const defaultTheme: UiKitTheme = Object.freeze({
  id: 'default', colors: Object.freeze({ ...COLORS }),
  typography: Object.freeze({ family: '"Segoe UI", system-ui, sans-serif', weight: 600, color: COLORS.text }),
  icon: Object.freeze({ stroke: 2.1, lineCap: 'round', lineJoin: 'round' }),
  visuals: Object.freeze(Object.fromEntries(visualRoles.map(role => [role, referenceRecipe])) as Record<VisualRole, VisualRecipe>),
});

export const chamferTheme: UiKitTheme = createChamferTheme(defaultTheme, visualRoles);
// Immutable definitions, not a global mutable style installation registry.
const builtins: Readonly<Record<UiKitThemeId, UiKitTheme>> = Object.freeze({ default: defaultTheme, chamfer: chamferTheme });
export function resolveUiKitTheme(selection: UiKitThemeSelection = 'default'): UiKitTheme {
  const theme = typeof selection === 'string' ? builtins[selection] : selection;
  if (!theme || typeof theme.id !== 'string' || !theme.colors || !theme.typography || !theme.icon ||
    Object.keys(COLORS).some(key => typeof theme.colors[key as keyof typeof COLORS] !== 'string') ||
    typeof theme.typography.family !== 'string' || !Number.isFinite(theme.typography.weight) || typeof theme.typography.color !== 'string' ||
    !Number.isFinite(theme.icon.stroke) || !['butt', 'round', 'square'].includes(theme.icon.lineCap) || !['round', 'bevel', 'miter'].includes(theme.icon.lineJoin) ||
    visualRoles.some(role => typeof theme.visuals?.[role]?.geometry !== 'function' || typeof theme.visuals?.[role]?.material !== 'function'))
    throw new TypeError(`Incomplete or unknown UI Kit theme: ${typeof selection === 'string' ? selection : selection?.id}`);
  return theme;
}

export interface PreparedStyle { commit(): void; discard(): void; refresh?(): void }
export interface VisualStyle { prepare(theme: UiKitTheme): PreparedStyle; dispose?(): void }
const styles = new WeakMap<THREE.Object3D, VisualStyle[]>();
export function registerVisualStyle(object: THREE.Object3D, style: VisualStyle): void {
  const list = styles.get(object) ?? []; list.push(style); styles.set(object, list);
}
export function visualStyles(object: THREE.Object3D): readonly VisualStyle[] { return styles.get(object) ?? []; }

/** Bind a mesh once. Switching replaces geometry and reuses its compatible material handle.
 * Stable material identity keeps control animation handles and consumer transparency edits valid.
 * Staging allocates no GPU resources; every temporary material is disposed after copying.
 */
const retiredVisuals = new WeakSet<{ dispose(): void }>();
function retire(resource: { dispose(): void }): void {
  if (!retiredVisuals.has(resource)) { retiredVisuals.add(resource); resource.dispose(); }
}

export function styleMesh<T extends THREE.Mesh>(mesh: T, role: VisualRole, input: GeometryInput, overrides: THREE.MaterialParameters = {}): T {
  let spec = input;
  const authored = (mesh.material as THREE.Material).clone();
  let disposed = false;
  const binding: VisualStyle = {
    prepare(theme) {
      const geometry = theme.visuals[role].geometry(spec);
      let material: THREE.Material;
      const copy = authored.clone();
      if (copy instanceof THREE.MeshStandardMaterial || copy instanceof THREE.MeshBasicMaterial) {
        for (const key of Object.keys(COLORS) as (keyof typeof COLORS)[]) if (copy.color.equals(new THREE.Color(COLORS[key]))) { copy.color.set(theme.colors[key]); break; }
      }
      try { material = theme.visuals[role].material(copy); }
      catch (error) { geometry.dispose(); copy.dispose(); throw error; }
      if (material !== copy) copy.dispose();
      material.setValues(overrides);
      const current = mesh.material as THREE.Material;
      if (material.constructor !== current.constructor) { geometry.dispose(); material.dispose(); throw new TypeError(`Theme material type mismatch: ${role}`); }
      // These are application composition flags, not theme choices (e.g. glass-card content).
      material.transparent = current.transparent;
      material.opacity = current.opacity;
      if (material instanceof THREE.ShaderMaterial && current instanceof THREE.ShaderMaterial) {
        for (const key of ['opacity', 'tilt']) if (current.uniforms[key] && material.uniforms[key])
          material.uniforms[key].value = current.uniforms[key].value?.clone?.() ?? current.uniforms[key].value;
      }
      let used = false;
      return {
        commit() {
          if (used) return; used = true;
          retire(mesh.geometry); mesh.geometry = geometry;
          current.copy(material); material.dispose(); current.needsUpdate = true;
        },
        discard() { if (!used) { used = true; geometry.dispose(); material.dispose(); } },
      };
    },
    dispose() { if (!disposed) { disposed = true; retire(mesh.geometry); retire(mesh.material as THREE.Material); retire(authored); } },
  };
  registerVisualStyle(mesh, binding);
  dynamicGeometry.set(mesh, {
    replace(next, theme) {
      const geometry = theme.visuals[role].geometry(next);
      retire(mesh.geometry); mesh.geometry = geometry; spec = next;
    },
  });
  return mesh;
}
const dynamicGeometry = new WeakMap<THREE.Mesh, { replace(input: GeometryInput, theme: UiKitTheme): void }>();
export function replaceStyledGeometry(mesh: THREE.Mesh, input: GeometryInput, theme: UiKitTheme): void {
  const binding = dynamicGeometry.get(mesh);
  if (!binding) throw new Error('Dynamic mesh has no theme geometry role');
  binding.replace(input, theme);
}
