import * as pc from 'playcanvas';
import { SURFACE } from '../physics/PhysicsConfig';
import type { MaterialFactory } from '../visual/MaterialFactory';
import { SCENE_COLORS } from '../visual/Palette';
import type { TrackConfig } from './TrackConfig';

/**
 * The bar that holds marbles at the line until "GO!" (PRD §12).
 *
 * Opening the gate rather than firing an impulse into each marble is the
 * fairer of the two options the PRD offers: every marble is released by the
 * same event and starts from rest, so no per-marble launch force can bias the
 * result.
 */
export class StartGate {
  readonly entity: pc.Entity;
  private open = false;

  constructor(config: TrackConfig, materials: MaterialFactory, gateY: number) {
    const material = materials.get({
      color: SCENE_COLORS.boardTrim,
      emissive: SCENE_COLORS.narrowPassage,
      emissiveIntensity: 0.7,
      metalness: 0.6,
      gloss: 0.85,
    });

    // Thick enough to clear MIN_COLLIDER_THICKNESS, so the field cannot fall
    // through the gate while it is still closed.
    const barThickness = 0.7;
    this.entity = new pc.Entity('start-gate');
    this.entity.addComponent('render', { type: 'box', material, castShadows: true });
    this.entity.setLocalScale(config.width, barThickness, config.depth * 0.9);
    this.entity.setLocalPosition(0, gateY, 0);

    this.entity.addComponent('collision', {
      type: 'box',
      halfExtents: new pc.Vec3(config.width / 2, barThickness / 2, (config.depth * 0.9) / 2),
    });
    this.entity.addComponent('rigidbody', {
      type: 'static',
      friction: SURFACE.wall.friction,
      restitution: 0.1,
    });
  }

  /** Removes the barrier. Idempotent. */
  release(): void {
    if (this.open) return;
    this.open = true;
    // Disabling the whole entity takes the body out of the world and hides the
    // bar in one step.
    this.entity.enabled = false;
  }

  /** Restores the barrier for the next race. */
  reset(): void {
    this.open = false;
    this.entity.enabled = true;
  }

  get isOpen(): boolean {
    return this.open;
  }
}
