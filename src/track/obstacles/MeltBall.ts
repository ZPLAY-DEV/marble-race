import * as pc from 'playcanvas';
import { SURFACE } from '../../physics/PhysicsConfig';
import { SCENE_COLORS } from '../../visual/Palette';
import type { MeltBallSpec } from '../TrackLayout';
import { type Obstacle, type ObstacleContext, createPeg } from './Obstacle';

/**
 * A white ball that melts away shortly after it is touched.
 *
 * Shaped exactly like a pop bumper so the two read as the same family of
 * thing, but coloured white and temporary: the first marble to touch one
 * starts a countdown, and when it expires the ball vanishes for the rest of
 * the race.
 *
 * They are packed into near-solid rows, which is safe only because they always
 * disappear. Any permanent obstacle at that density would simply dam the board
 * — this one turns the dam into a countdown, and the field has to chew a hole
 * through it.
 *
 * The countdown runs on the fixed physics step rather than wall-clock, so a
 * seed melts the same balls in the same order at any frame rate.
 */
export function createMeltBall(spec: MeltBallSpec, context: ObstacleContext): Obstacle {
  const entity = createPeg(
    'melt-ball',
    spec.radius,
    context.config.depth * 0.86,
    context.materials.get({
      color: SCENE_COLORS.meltBall,
      emissive: SCENE_COLORS.meltBall,
      emissiveIntensity: 0.5,
      metalness: 0.05,
      gloss: 0.9,
    }),
    SURFACE.meltBall,
  );
  entity.setLocalPosition(spec.x, spec.y, 0);
  entity.tags.add('obstacle', 'melt-ball');

  const mesh = entity.children[0] as pc.Entity | undefined;
  const baseScale = mesh ? mesh.getLocalScale().clone() : null;

  /** Seconds of contact time elapsed; negative means "not yet touched". */
  let melting = -1;

  entity.collision?.on('collisionstart', (result: pc.ContactResult) => {
    if (melting >= 0) return; // already counting down
    const body = result.other.rigidbody;
    if (!body || body.type !== pc.BODYTYPE_DYNAMIC) return;
    melting = 0;
    context.onMeltStart?.(result.other);
  });

  return {
    entity,
    update(dt: number) {
      if (melting < 0) return;
      melting += dt;

      if (melting >= spec.meltSeconds) {
        // Disabling removes the collider and the mesh together, so the ball
        // stops blocking at exactly the moment it stops being drawn.
        if (entity.enabled) entity.enabled = false;
        return;
      }

      // Shrink over the final stretch so the melt is visible coming.
      if (mesh && baseScale) {
        const remaining = 1 - melting / spec.meltSeconds;
        const shrink = 0.35 + 0.65 * Math.min(1, remaining * 1.6);
        mesh.setLocalScale(baseScale.x * shrink, baseScale.y, baseScale.z * shrink);
      }
    },
  };
}
