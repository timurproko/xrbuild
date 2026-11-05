// Button: poke it with a fingertip. The cap follows the finger in, clicks at 60 % of its
// travel and releases below 30 % (the core's press / release rule); once pressed it stays with
// the finger through sideways drift. Two shapes with the same look: a pill with text and a round icon button.
import * as THREE from 'three';
import { PokeTarget } from '@xr-build/sdk';
import { Control, placeCursor, sourceOf, touchCursor } from './control.ts';
import { Icon, type IconNode } from './icon.ts';
import { Label } from './label.ts';
import { play } from './sound.ts';
import { COLORS, approach, material, roundedBox, roundedDisc } from './theme.ts';

export interface ButtonOptions {
  title: string;
  shape: 'pill' | 'round';
  /** text (pill) or glyph (round) on the cap */
  text: string;
  /** round: a Lucide icon on the cap instead of the text (import { ArrowRight } from 'lucide') */
  icon?: IconNode;
  /** icon stroke width in Lucide units = millimetres on the cap (default 2.1; Lucide's own is 2) */
  iconStroke?: number;
}

const TRAVEL = 0.009;
const CAP_DEPTH = 0.008;
const REST = 0.012;  // gap from the base to the cap's back at rest

export class Button extends Control {
  clicks = 0;
  private readonly cap = new THREE.Group();
  private readonly capMaterial: THREE.MeshStandardMaterial;
  private readonly poke: PokeTarget;
  private readonly cursor = touchCursor();
  private readonly top = REST + CAP_DEPTH;
  private shown = 0;
  private hover = 0;

  constructor(options: ButtonOptions) {
    const pill = options.shape === 'pill';
    const w = pill ? 0.07 : 0.05, h = pill ? 0.028 : 0.05;
    super(options.title, -h / 2 - 0.016);
    // Both shapes share one look: light bevelled cap in a dark well, dark glyph.
    const base = new THREE.Mesh(pill ? roundedBox(w + 0.008, h + 0.008, 0.004, (h + 0.008) / 2) : roundedDisc(w / 2 + 0.004, 0.004), material(COLORS.well));
    this.capMaterial = material(COLORS.cap, { roughness: 0.35 });
    const capMesh = new THREE.Mesh(pill ? roundedBox(w, h, CAP_DEPTH, h / 2) : roundedDisc(w / 2, CAP_DEPTH), this.capMaterial);
    const glyph = !pill && options.icon ? new Icon(options.icon, { size: 0.022, stroke: options.iconStroke }) : new Label(options.text, { size: pill ? 0.0085 : 0.019, color: '#30363f', weight: pill ? 600 : 900 });
    glyph.position.z = CAP_DEPTH + 0.0003;
    this.cap.add(capMesh, glyph);
    this.cap.position.z = REST;
    this.add(base, this.cap, this.cursor);
    // The visible outline; the core adds its poke margin (1 cm) around it.
    const inside = pill
      ? (x: number, y: number) => Math.abs(x) < w / 2 && Math.abs(y) < h / 2
      : (x: number, y: number) => Math.hypot(x, y) < w / 2;
    this.poke = this.target(new PokeTarget(this, { inside, top: this.top, travel: TRAVEL }));
    this.poke.on((e) => {
      if (e.type === 'start') this.click(sourceOf(e.source));
      else if (e.type === 'end') { play('release'); this.emit('release', { source: sourceOf(e.source) }); }
    });
    this.status.set('Clicks: 0');
  }

  update(dt: number): void {
    const s = this.poke.state;
    // The cap tracks the finger 1:1 (it must never lag behind a fingertip); easing only on the way back.
    const depth = this.enabled ? s.depth : 0;
    this.shown = depth > this.shown ? depth : approach(this.shown, depth, dt);
    this.cap.position.z = REST - this.shown;
    const hoverTarget = this.enabled ? Math.max(s.proximity, s.mouseOver ? 0.6 : 0) : 0;
    this.hover = approach(this.hover, hoverTarget, dt);
    const pressed = s.held;
    this.capMaterial.color.set(COLORS.cap).lerp(new THREE.Color(COLORS.accent), pressed ? 0.55 : this.hover * 0.25);
    this.capMaterial.emissive.set(COLORS.accent).multiplyScalar(pressed ? 0.25 : this.hover * 0.08);
    placeCursor(this.cursor, this.poke, this.top - this.shown, this.enabled);
    this.fade(dt);
  }

  private click(source: 'hand' | 'mouse'): void {
    this.clicks++;
    play('press');
    this.status.set(`Clicks: ${this.clicks}`);
    this.emit('click', { source });
  }
}
