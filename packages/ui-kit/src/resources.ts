import type * as THREE from 'three';
import { visualStyles, resolveUiKitTheme, type UiKitThemeSelection, type VisualStyle, type PreparedStyle } from './visual-theme.ts';

type Resource = { dispose(): void };
const retired = new WeakSet<Resource>();

/** Own only construction-time resources, never content later supplied by a consumer. */
export class VisualResources {
  private readonly resources = new Set<Resource>();
  private disposed = false;
  private readonly styles = new Set<VisualStyle>();

  setTheme(selection: UiKitThemeSelection): void {
    if (this.disposed) throw new Error('Cannot theme disposed visuals');
    const theme = resolveUiKitTheme(selection);
    const staged: PreparedStyle[] = [];
    try { for (const style of this.styles) staged.push(style.prepare(theme)); }
    catch (error) { for (const style of staged) style.discard(); throw error; }
    for (const style of staged) style.commit();
  }

  capture(root: THREE.Object3D, ownTextures = true): void {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      const styling = visualStyles(object);
      for (const style of styling) { this.styles.add(style); if (style.dispose) this.add(style as Resource); }
      const ownsMesh = styling.some(style => style.dispose);
      if (mesh.geometry && !ownsMesh) this.add(mesh.geometry);
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) if (material) {
        if (!ownsMesh) this.add(material);
        for (const value of ownTextures ? Object.values(material) : []) {
          if (value && typeof value === 'object' && 'isTexture' in value && value.isTexture) this.add(value as THREE.Texture);
        }
      }
    });
  }

  add(resource: Resource): void { this.resources.add(resource); }

  replace(previous: Resource, next: Resource): void {
    this.resources.delete(previous);
    previous.dispose();
    this.add(next);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const resource of this.resources) if (!retired.has(resource)) {
      retired.add(resource);
      resource.dispose();
    }
    this.resources.clear();
    this.styles.clear();
  }
}
