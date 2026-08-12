import * as pc from 'playcanvas';
import { SURFACE } from '../../physics/PhysicsConfig';
import { SCENE_COLORS } from '../../visual/Palette';
import type { RotorSpec } from '../TrackLayout';
import { type Obstacle, type ObstacleContext, createStaticBox } from './Obstacle';

/**
 * A paddle spinning at constant angular velocity about the board normal.
 *
 * Two decisions matter here. The body is *kinematic*, so marbles are pushed by
 * it but never push it back — an obstacle whose speed depended on how many
 * marbles hit it would make results depend on player count. And its angle is
 * integrated on the fixed physics step from an explicit accumulator rather than
 * from wall-clock time, which is what keeps it reproducible (PRD §18).
 */
export function createRotor(spec: RotorSpec, context: ObstacleContext): Obstacle {
  const material = context.materials.get({
    color: SCENE_COLORS.rotor,
    emissiveIntensity: 0.45,
    metalness: 0.6,
    gloss: 0.8,
  });

  const bar = createStaticBox(
    'rotor',
    new pc.Vec3(spec.length, 0.62, context.config.depth * 0.86),
    material,
    SURFACE.rotor,
  );
  bar.setLocalPosition(spec.x, spec.y, 0);
  bar.tags.add('obstacle', 'rotor');

  const body = bar.rigidbody;
  if (body) body.type = pc.BODYTYPE_KINEMATIC;

  // Hub, so the paddle reads as mounted rather than floating.
  const hubMaterial = context.materials.get({
    color: SCENE_COLORS.rotor,
    emissiveIntensity: 0.9,
    metalness: 0.3,
    gloss: 0.9,
  });
  const hub = new pc.Entity('rotor-hub');
  hub.addComponent('render', { type: 'cylinder', material: hubMaterial, castShadows: false });
  hub.setLocalScale(0.7, context.config.depth * 0.95, 0.7);
  hub.setLocalEulerAngles(90, 0, 0);
  hub.setLocalPosition(spec.x, spec.y, 0);

  let angle = spec.phase;
  bar.setLocalEulerAngles(0, 0, angle);

  return {
    entity: bar,
    decoration: hub,
    update(dt: number) {
      angle = (angle + spec.speed * dt) % 360;
      bar.setLocalEulerAngles(0, 0, angle);
    },
  };
}
