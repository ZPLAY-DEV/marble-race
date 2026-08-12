import * as pc from 'playcanvas';
import { hexToRgb } from './Palette';

export interface MaterialOptions {
  color: string;
  metalness?: number;
  gloss?: number;
  /** Emissive colour; defaults to `color` when `emissiveIntensity` is set. */
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
}

/**
 * Creates and caches standard materials.
 *
 * Caching matters: the track builds hundreds of pieces, and a distinct material
 * per piece would break batching and cost draw calls for no visual gain
 * (PRD §19).
 */
export class MaterialFactory {
  private readonly cache = new Map<string, pc.StandardMaterial>();

  get(options: MaterialOptions): pc.StandardMaterial {
    const key = JSON.stringify(options);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const material = new pc.StandardMaterial();
    const [r, g, b] = hexToRgb(options.color);
    material.diffuse.set(r, g, b);
    material.metalness = options.metalness ?? 0.1;
    material.gloss = options.gloss ?? 0.6;
    material.useMetalness = true;

    if (options.emissiveIntensity) {
      const [er, eg, eb] = hexToRgb(options.emissive ?? options.color);
      material.emissive.set(er, eg, eb);
      material.emissiveIntensity = options.emissiveIntensity;
    }

    if (options.opacity !== undefined && options.opacity < 1) {
      material.opacity = options.opacity;
      material.blendType = pc.BLEND_NORMAL;
    }

    material.update();
    this.cache.set(key, material);
    return material;
  }

  destroy(): void {
    for (const material of this.cache.values()) material.destroy();
    this.cache.clear();
  }
}
