/** Portable Hands adjustments. No provider identity, workspace path or device processing. */
export interface HandAppearance {
  showJoints: boolean; showBones: boolean;
  jointDiameterMm: number; boneDiameterMm: number;
  jointColorLinear: [number, number, number]; boneColorLinear: [number, number, number];
  opacity: number; showPinchGrabIndicator: boolean; indicatorDiameterMm: number;
  indicatorColorLinear: [number, number, number]; indicatorOpacity: number;
}
export interface HandProfile {
  version: 1;
  offsetMm: { x: number; y: number; z: number };
  sizeFactor: number;
  /** Only explicit overrides; absent fields retain an author's constructor style. */
  appearance: Partial<HandAppearance>;
}
export const HAND_APPEARANCE_DEFAULTS: HandAppearance = {
  showJoints: true, showBones: true, jointDiameterMm: 15, boneDiameterMm: 15,
  jointColorLinear: [0, .541, 1], boneColorLinear: [0, .482, 1], opacity: .333,
  showPinchGrabIndicator: true, indicatorDiameterMm: 30, indicatorColorLinear: [1, 1, 1], indicatorOpacity: .9,
};
export const HAND_APPEARANCE_RANGES = { jointDiameterMm: [1, 40], boneDiameterMm: [1, 30], opacity: [0, 1], indicatorDiameterMm: [1, 60], indicatorOpacity: [0, 1] } as const;
export const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function number(v: unknown, field: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`${field}: expected a finite number in ${min}..${max}`);
  return v;
}
export function handProfile(value: unknown = {}): HandProfile {
  if (!object(value)) throw new Error('Hands adjustments: expected an object');
  if (value.version !== undefined && value.version !== 1) throw new Error('Hands adjustments: unsupported version');
  const offset = value.offsetMm === undefined ? {} : value.offsetMm;
  if (!object(offset)) throw new Error('offsetMm: expected X, Y and Z in millimetres');
  const appearance = value.appearance === undefined ? {} : value.appearance;
  if (!object(appearance)) throw new Error('appearance: expected an object');
  const result: Partial<HandAppearance> = {};
  for (const key of Object.keys(HAND_APPEARANCE_DEFAULTS) as (keyof HandAppearance)[]) {
    const v = appearance[key]; if (v === undefined) continue;
    let parsed: unknown;
    if (key.endsWith('ColorLinear')) {
      if (!Array.isArray(v) || v.length !== 3) throw new Error(`appearance.${key}: expected three linear colour components in 0..1`);
      parsed = v.map((c, i) => number(c, `appearance.${key}[${i}]`, 0, 1));
    } else if (key.startsWith('show')) {
      if (typeof v !== 'boolean') throw new Error(`appearance.${key}: expected a boolean`);
      parsed = v;
    } else {
      const [min, max] = HAND_APPEARANCE_RANGES[key as keyof typeof HAND_APPEARANCE_RANGES];
      parsed = number(v, `appearance.${key}`, min, max);
    }
    Object.assign(result, { [key]: parsed });
  }
  return { version: 1, offsetMm: { x: number(offset.x === undefined ? 0 : offset.x, 'offsetMm.x', -150, 150), y: number(offset.y === undefined ? 0 : offset.y, 'offsetMm.y', -150, 150), z: number(offset.z === undefined ? 0 : offset.z, 'offsetMm.z', -150, 150) },
    sizeFactor: number(value.sizeFactor === undefined ? 1 : value.sizeFactor, 'sizeFactor', .5, 1.5), appearance: result };
}
export const sameHandGeometry = (a: HandProfile, b: HandProfile): boolean => a.sizeFactor === b.sizeFactor && (['x', 'y', 'z'] as const).every(k => a.offsetMm[k] === b.offsetMm[k]);
