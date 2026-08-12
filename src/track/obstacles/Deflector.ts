import * as pc from 'playcanvas';
import { SCENE_COLORS } from '../../visual/Palette';
import type { DeflectorSpec } from '../TrackLayout';
import type { Obstacle, ObstacleContext } from './Obstacle';

/**
 * A trigger volume that kicks whatever enters it sideways.
 *
 * Unlike every other obstacle, this one injects randomness *during* the race
 * rather than at build time — which is exactly why it draws from the seeded
 * stream instead of Math.random (PRD §8, §24). Two marbles taking the same
 * line still get different kicks, but the whole sequence replays identically
 * from the same seed.
 *
 * Fairness note (PRD §27): the kick direction is symmetric and independent of
 * which marble triggered it, so no player is favoured.
 */
export function createDeflector(spec: DeflectorSpec, context: ObstacleContext): Obstacle {
  const material = context.materials.get({
    color: SCENE_COLORS.deflector,
    // Kept below full blast so the orange stays orange; pushed higher it washes
    // out toward the splitters' yellow and the two stop reading as different.
    emissiveIntensity: 0.95,
    metalness: 0,
    gloss: 0.4,
    opacity: 0.9,
  });

  const entity = new pc.Entity('deflector');
  entity.setLocalPosition(spec.x, spec.y, 0);
  entity.tags.add('obstacle', 'deflector');

  entity.addComponent('collision', {
    type: 'sphere',
    radius: spec.radius,
  });
  // No rigidbody component means PlayCanvas treats this collision volume as a
  // trigger, firing `triggerenter` without ever blocking a marble.

  // A ring, not a sphere: a translucent ball reads as a muddy blob and hides
  // the marbles passing through it, whereas an open ring says "field" and
  // leaves the race visible underneath (PRD §14).
  const ring = new pc.Entity('deflector-ring');
  ring.addComponent('render', { type: 'torus', material, castShadows: false });
  ring.setLocalScale(spec.radius * 1.9, spec.radius * 1.9, spec.radius * 1.9);
  ring.setLocalEulerAngles(90, 0, 0); // lay the ring flat against the board
  entity.addChild(ring);

  const random = context.random;
  const localImpulse = new pc.Vec3();
  const worldImpulse = new pc.Vec3();

  entity.collision?.on('triggerenter', (other: pc.Entity) => {
    const body = other.rigidbody;
    if (!body || body.type !== pc.BODYTYPE_DYNAMIC) return;

    // Kick across the board (local X) with a small push down-board, so a
    // deflector can never bring a marble to a halt.
    const lateral = random.chance(0.5) ? spec.strength : -spec.strength;
    const along = random.range(0, spec.strength * 0.35);
    localImpulse.set(lateral, -along, 0);

    // The deflector carries no local rotation of its own, so its world
    // rotation is the board's — exactly the basis the impulse is expressed in.
    entity.getRotation().transformVector(localImpulse, worldImpulse);
    body.applyImpulse(worldImpulse.x, worldImpulse.y, worldImpulse.z);
  });

  return { entity };
}
