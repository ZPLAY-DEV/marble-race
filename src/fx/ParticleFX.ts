import * as pc from 'playcanvas';
import { hexToRgb } from '../visual/Palette';

/**
 * Impact and celebration bursts (PRD §14).
 *
 * Emitters are pooled and recycled round-robin. Creating a particle system per
 * hit would allocate GPU buffers mid-race, which is exactly the kind of hitch
 * that wrecks the 60 FPS target in PRD §19.
 */
export class ParticleFX {
  private readonly root: pc.Entity;
  private readonly pool: pc.Entity[] = [];
  /** Last colour applied to each emitter, so we only rebuild on a real change. */
  private readonly tint: string[] = [];
  private nextIndex = 0;

  constructor(parent: pc.Entity, poolSize = 8) {
    this.root = new pc.Entity('particles');
    parent.addChild(this.root);

    for (let i = 0; i < poolSize; i++) {
      this.pool.push(this.createEmitter());
      this.tint.push('');
    }
  }

  /** Fires a short burst at a world position, tinted to the given colour. */
  burst(position: pc.Vec3, color: string, scale = 1): void {
    const index = this.nextIndex;
    this.nextIndex = (this.nextIndex + 1) % this.pool.length;

    const emitter = this.pool[index];
    const system = emitter.particlesystem;
    if (!system) return;

    emitter.setPosition(position);
    emitter.setLocalScale(scale, scale, scale);

    // Re-tinting rebuilds the emitter's internal ramp texture, so skip it when
    // this emitter is already the right colour.
    if (this.tint[index] !== color) {
      const [r, g, b] = hexToRgb(color);
      system.colorGraph = new pc.CurveSet([
        [0, r, 1, r],
        [0, g, 1, g],
        [0, b, 1, b],
      ]);
      this.tint[index] = color;
    }

    system.reset();
    system.play();
  }

  private createEmitter(): pc.Entity {
    const entity = new pc.Entity('burst');

    entity.addComponent('particlesystem', {
      numParticles: 14,
      lifetime: 0.4,
      rate: 0.001,
      rate2: 0.003,
      loop: false,
      autoPlay: false,
      emitterShape: pc.EMITTERSHAPE_SPHERE,
      emitterRadius: 0.12,
      initialVelocity: 4,
      blendType: pc.BLEND_ADDITIVE,
      lighting: 0,
      depthWrite: false,
      scaleGraph: new pc.Curve([0, 0.3, 1, 0]),
      alphaGraph: new pc.Curve([0, 1, 1, 0]),
      // Gentle downward drift so sparks fall away rather than hanging.
      velocityGraph: new pc.CurveSet([
        [0, 0],
        [0, -2.5],
        [0, 0],
      ]),
    });

    this.root.addChild(entity);
    return entity;
  }

  destroy(): void {
    this.root.destroy();
    this.pool.length = 0;
    this.tint.length = 0;
  }
}
