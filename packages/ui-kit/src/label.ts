// Text in the scene. On a 3D display the DOM is seen by one eye only, so all text is drawn into a
// canvas texture on a plane. Redraws only when the text changes.
import * as THREE from 'three';
import { COLORS } from './theme.ts';

export interface LabelOptions {
  /** font size in metres */
  size?: number;
  color?: string;
  weight?: number;
  align?: 'left' | 'center' | 'right';
}

const FONT_PX = 64;  // canvas pixels per font size (about 2x the panel's pixel density)

export class Label extends THREE.Object3D {
  private readonly canvas = document.createElement('canvas');
  private readonly texture = new THREE.CanvasTexture(this.canvas);
  private readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly o: Required<LabelOptions>;
  private text = '';
  private color: string;

  constructor(text: string, options: LabelOptions = {}) {
    super();
    this.o = { size: 0.011, color: COLORS.text, weight: 600, align: 'center', ...options };
    this.color = this.o.color;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false }));
    this.mesh.raycast = () => {};  // text never takes the mouse from the control under it
    this.add(this.mesh);
    this.set(text);
  }

  set(text: string, color = this.color): void {
    if (text === this.text && color === this.color) return;
    this.text = text;
    this.color = color;
    const ctx = this.canvas.getContext('2d')!;
    const font = `${this.o.weight} ${FONT_PX}px "Segoe UI", system-ui, sans-serif`;
    ctx.font = font;
    const lines = text.split('\n');
    const lineH = FONT_PX * 1.3;
    const width = Math.max(1, ...lines.map((l) => ctx.measureText(l).width)) + 8;
    this.canvas.width = Math.ceil(width);
    this.canvas.height = Math.ceil(lineH * lines.length);
    ctx.font = font;  // resizing the canvas resets the context
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = this.o.align;
    const x = this.o.align === 'left' ? 4 : this.o.align === 'right' ? this.canvas.width - 4 : this.canvas.width / 2;
    lines.forEach((l, i) => ctx.fillText(l, x, lineH * (i + 0.5)));
    this.texture.dispose();  // new size: let three.js reallocate
    this.texture.needsUpdate = true;
    const m = this.o.size / FONT_PX;  // metres per canvas pixel
    this.mesh.scale.set(this.canvas.width * m, this.canvas.height * m, 1);
    this.mesh.position.x = this.o.align === 'left' ? this.mesh.scale.x / 2 : this.o.align === 'right' ? -this.mesh.scale.x / 2 : 0;
  }

  set opacity(v: number) {
    this.mesh.material.opacity = v;
  }
}
