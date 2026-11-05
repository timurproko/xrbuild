// Dialog: a frosted-glass sheet that floats in front of the board (lifted along +z, toward the
// viewer, so a 3D display shows it closer than everything behind it). The background shows through
// blurred, in the style of visionOS panels. It carries a heading, a text and a Close button.
import * as THREE from 'three';
import { PokeTarget } from '@xr-build/sdk';
import { Button } from './button.ts';
import { Control } from './control.ts';
import { GlassEdge } from './glass-edge.ts';
import { Label } from './label.ts';
import { play } from './sound.ts';
import { COLORS, approach, glass, roundedBox } from './theme.ts';

export interface DialogOptions {
  title: string;
  /** body text; '\n' starts a new line */
  text: string;
  width?: number;
  height?: number;
  /** how far in front of the dialog's own position the sheet floats, metres */
  lift?: number;
  closeText?: string;
}

export class Dialog extends Control {
  isOpen = false;
  readonly closeButton: Button;
  readonly lift: number;
  private readonly sheet = new THREE.Group();
  private readonly pane: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  private shown = 0;
  private readonly edge: GlassEdge;
  /** the glass itself as a target: it takes the mouse and fingers, so nothing behind the sheet reacts through it */
  private readonly blocker: PokeTarget;

  constructor(options: DialogOptions) {
    super(options.title, 0);
    this.title.visible = this.status.visible = false;  // the dialog shows its own heading
    const w = options.width ?? 0.2, h = options.height ?? 0.12;
    this.lift = options.lift ?? 0.07;
    this.pane = new THREE.Mesh(roundedBox(w, h, 0.006, 0.014, 0.0005), glass());  // a crisp 0.5 mm bevel: a glass sheet, not a pillow
    // A milky film on the glass gives it a surface.
    const film = new THREE.Mesh(roundedBox(w - 0.002, h - 0.002, 0.0005, 0.013), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.14, depthWrite: false }));
    film.position.z = 0.0062;
    film.userData.keepLook = true;
    // The lit edge: a soft line of light along the outline that slides with the viewer's eye.
    this.edge = new GlassEdge({ width: w, height: h, radius: 0.014 });
    this.edge.position.z = 0.0065;
    const heading = new Label(options.title, { size: 0.011, weight: 700 });
    heading.position.set(0, h / 2 - 0.022, 0.0075);
    const body = new Label(options.text, { size: 0.0072, weight: 500, color: COLORS.text });
    body.position.set(0, 0.006, 0.0075);
    this.closeButton = new Button({ title: '', shape: 'pill', text: options.closeText ?? 'Close' });
    this.closeButton.title.visible = this.closeButton.status.visible = false;
    this.closeButton.position.set(0, -h / 2 + 0.028, 0.0075);
    this.closeButton.on('click', (e) => this.close(e.source as 'hand' | 'mouse'));
    this.sheet.add(this.pane, film, this.edge, heading, body, this.closeButton);
    // Everything on the sheet stays in the transparent pass: three.js copies opaque objects into the
    // glass's blurred backdrop, so an opaque Close button would show a blurred, refracted ghost of
    // itself through the glass. (Fading only tints colours, so this setting is kept.)
    this.closeButton.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.transparent = true;
    });
    this.sheet.position.z = this.lift;
    this.add(this.sheet);
    // Its front face is the surface (z 6 mm in the sheet); the Close button stands in front of it and wins.
    this.blocker = this.target(new PokeTarget(this.sheet, { inside: (x, y) => Math.abs(x) < w / 2 && Math.abs(y) < h / 2, top: 0.002, travel: 0.004 }));
    this.blocker.tuning = { pokeMargin: 0 };
    this.visible = false;
    this.blocker.enabled = false;
    this.closeButton.setEnabled(false);
  }

  attach(interactor: Parameters<Control['attach']>[0]): this {
    super.attach(interactor);
    this.closeButton.attach(interactor);
    return this;
  }

  detach(): void {
    super.detach();
    this.closeButton.detach();
  }

  open(source: 'hand' | 'mouse' | 'code' = 'code'): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.visible = true;
    this.blocker.enabled = this.enabled;
    this.closeButton.setEnabled(this.enabled);
    if (source !== 'code') play('on');
    this.emit('open', { source });
  }

  close(source: 'hand' | 'mouse' | 'code' = 'code'): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.blocker.enabled = false;
    this.closeButton.setEnabled(false);
    if (source !== 'code') play('off');
    this.emit('close', { source });
  }

  setEnabled(v: boolean): void {
    super.setEnabled(v);
    this.blocker.enabled = v && this.isOpen;
    this.closeButton.setEnabled(v && this.isOpen);
  }

  update(dt: number): void {
    // Opens by growing and coming forward a little; closes the same way back, then hides.
    this.shown = approach(this.shown, this.isOpen ? 1 : 0, dt, 14);
    if (!this.isOpen && this.shown < 0.02) this.visible = false;
    this.sheet.scale.setScalar(0.9 + 0.1 * this.shown);
    this.sheet.position.z = this.lift - (1 - this.shown) * 0.02;
    this.edge.opacity = this.shown * (this.enabled ? 1 : 0.3);
    this.closeButton.update(dt);
    this.fade(dt);
  }
}
