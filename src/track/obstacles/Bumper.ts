import * as pc from 'playcanvas';
import { bumperKick, SURFACE } from '../../physics/PhysicsConfig';
import {
  BUMPER_HEAT_STEPS,
  bumperHeatColor,
  bumperHeatEmissive,
  SCENE_COLORS,
} from '../../visual/Palette';
import type { BumperSpec } from '../TrackLayout';
import { type Obstacle, type ObstacleContext, createPeg } from './Obstacle';

/**
 * Pop bumper that charges up as it is hit.
 *
 * Every impact advances it one heat step, up to BUMPER_HEAT_STEPS, turning it
 * progressively redder and doubling the kick it delivers. A bumper the field
 * keeps clipping becomes the most dangerous thing on the board, and its colour
 * says so before it fires.
 *
 * The kick is an explicit outward impulse rather than a restitution bump.
 * Restitution only reflects the speed a marble arrives with, so a marble that
 * trickles in would get a feeble response no matter how charged the bumper is;
 * an impulse fires the same regardless, which is what makes the heat level
 * mean something.
 *
 * The impulse is applied in the board plane, radially away from the peg — the
 * component along the board normal is removed, so a charged bumper cannot fire
 * a marble off the board face or into it.
 */

/** Simulated seconds before the same marble can charge this bumper again. */
const REARM_SECONDS = 0.12;

export function createBumper(spec: BumperSpec, context: ObstacleContext): Obstacle {
  const entity = createPeg(
    'bumper',
    spec.radius,
    context.config.depth * 0.86,
    materialFor(context, 0),
    SURFACE.bumper,
  );
  entity.setLocalPosition(spec.x, spec.y, 0);
  entity.tags.add('bumper', 'obstacle');

  const render = entity.findComponent('render') as pc.RenderComponent | null;

  // Board normal in world space, used to keep the kick in the board plane.
  const normal = new pc.Vec3(0, 0, 1);
  context.boardRotation.transformVector(normal, normal);
  normal.normalize();

  const away = new pc.Vec3();
  let level = 0;
  let clock = 0;
  const chargedAt = new Map<string, number>();

  entity.collision?.on('collisionstart', (result: pc.ContactResult) => {
    const other = result.other;
    const body = other.rigidbody;
    if (!body || body.type !== pc.BODYTYPE_DYNAMIC) return;

    // A marble rolling along the peg can start contact repeatedly; without this
    // a single graze would charge the bumper to maximum.
    const last = chargedAt.get(other.name);
    if (last !== undefined && clock - last < REARM_SECONDS) return;
    chargedAt.set(other.name, clock);

    // Fire at the current charge, then heat up — so the first hit is the cold
    // kick and the colour a player sees is what the *next* hit will deliver.
    away.copy(other.getPosition()).sub(entity.getPosition());
    away.sub(normal.clone().mulScalar(away.dot(normal))); // project into the board plane
    if (away.length() < 1e-4) return;

    away.normalize().mulScalar(bumperKick(level));
    body.activate();
    body.applyImpulse(away.x, away.y, away.z);

    if (level < BUMPER_HEAT_STEPS - 1) {
      level++;
      if (render) render.material = materialFor(context, level);
    }
    context.onBumperHit?.(other, level);
  });

  return {
    entity,
    update(dt: number) {
      clock += dt;
    },
  };
}

function materialFor(context: ObstacleContext, level: number): pc.StandardMaterial {
  return context.materials.get({
    color: bumperHeatColor(level),
    emissive: bumperHeatColor(level),
    emissiveIntensity: bumperHeatEmissive(level),
    metalness: 0.15,
    gloss: 0.85,
  });
}

/** Thin emissive ring drawn around a bumper. Purely decorative. */
export function createBumperGlow(spec: BumperSpec, context: ObstacleContext): pc.Entity {
  const material = context.materials.get({
    color: SCENE_COLORS.bumperEmissive,
    emissiveIntensity: 1.2,
    opacity: 0.35,
  });
  const glow = new pc.Entity('bumper-glow');
  glow.addComponent('render', { type: 'cylinder', material, castShadows: false });
  glow.setLocalScale(spec.radius * 2.9, 0.05, spec.radius * 2.9);
  glow.setLocalEulerAngles(90, 0, 0);
  glow.setLocalPosition(spec.x, spec.y, -context.config.depth * 0.42);
  return glow;
}
