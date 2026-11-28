// Button: poke it with a fingertip. The cap follows the finger in, clicks at 60 % of its
// travel and releases below 30 % (the core's press / release rule); once pressed it stays with
// the finger through sideways drift. Two shapes with the same look: a pill with text and a round icon button.
import * as THREE from 'three';
import { PokeTarget } from '@xr-build/sdk';
import { Control, placeCursor, sourceOf, touchCursor } from './control.ts';
import type { IconNode } from './icon.ts';
import { buttonVisual } from './default-visuals.ts';
import { play } from './sound.ts';
import { approach } from './theme.ts';
import type { ThemeOptions } from './visual-theme.ts';

export interface ButtonOptions extends ThemeOptions {
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
  private readonly cap: THREE.Group;
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
    const visual = buttonVisual(options, w, h, CAP_DEPTH, REST);
    this.cap = visual.cap;
    this.capMaterial = visual.capMaterial;
    this.add(visual.base, this.cap, this.cursor);
    // The visible outline; the core adds its poke margin (1 cm) around it.
    const inside = pill
      ? (x: number, y: number) => Math.abs(x) < w / 2 && Math.abs(y) < h / 2
      : (x: number, y: number) => Math.hypot(x, y) < w / 2;
    this.poke = this.target(new PokeTarget(this, { inside, top: this.top, travel: TRAVEL }));
    this.listen(this.poke, (e) => {
      if (e.type === 'start') this.click(sourceOf(e.source));
      else if (e.type === 'end') { play('release'); this.emit('release', { source: sourceOf(e.source) }); }
    });
    this.status.set('Clicks: 0');
    this.visuals.capture(this);
    if (options.theme) this.setTheme(options.theme);
  }

  update(dt: number): void {
    const s = this.poke.state;
    // The cap tracks the finger 1:1 (it must never lag behind a fingertip); easing only on the way back.
    const depth = this.enabled ? s.depth : 0;
    this.shown = depth > this.shown ? depth : approach(this.shown, depth, dt);
    this.cap.position.z = REST - this.shown;
    const hoverTarget = this.enabled ? Math.max(s.proximity, s.mouseOver ? 0.6 : 0) : 0;
    this.hover = approach(this.hover, hoverTarget, dt);
    this.refreshTheme();
    placeCursor(this.cursor, this.poke, this.top - this.shown, this.enabled);
    this.fade(dt);
  }

  protected refreshTheme(): void {
    const colors = this.theme.colors, pressed = this.poke.state.held;
    this.capMaterial.color.set(colors.cap).lerp(new THREE.Color(colors.accent), pressed ? 0.55 : this.hover * 0.25);
    this.capMaterial.emissive.set(colors.accent).multiplyScalar(pressed ? 0.25 : this.hover * 0.08);
    this.fade(0);
  }

  private click(source: 'hand' | 'mouse'): void {
    this.clicks++;
    play('press');
    this.status.set(`Clicks: ${this.clicks}`);
    this.emit('click', { source });
  }
}
