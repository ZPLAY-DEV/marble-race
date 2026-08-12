import * as pc from 'playcanvas';
import { SCENE_COLORS } from '../../visual/Palette';
import type { LauncherSpec } from '../TrackLayout';
import type { Obstacle, ObstacleContext } from './Obstacle';

/**
 * The pinball kicker: anything that touches it is thrown back *up* the board.
 *
 * This is the obstacle that makes a run unpredictable rather than merely
 * branching. A marble three-quarters of the way home can be fired back up two
 * rows and lose ten places, which is the whole appeal of watching (PRD §27).
 *
 * Three decisions worth knowing:
 *
 * - **It is a trigger, not a solid pad.** A solid launcher would be one more
 *   surface a marble could settle against, which is exactly what used to run
 *   races to the timeout. A pass-through kicker can be placed anywhere — hard
 *   against a wall, tucked in a corner — with no chance of a dead end.
 * - **A fixed impulse, not high restitution.** Restitution only reflects what
 *   arrives, so a marble that trickles on gets a feeble nudge. A fixed kick
 *   fires every time, which is what reads as a launch.
 * - **Cooldown is measured in simulation time**, accumulated from the fixed
 *   step, so the launcher behaves identically at any frame rate (PRD §18).
 */

/** Simulated seconds a marble is immune after being launched by this pad. */
const COOLDOWN_SECONDS = 0.9;

export function createLauncher(spec: LauncherSpec, context: ObstacleContext): Obstacle {
  const material = context.materials.get({
    color: SCENE_COLORS.launcher,
    emissiveIntensity: 1.15,
    metalness: 0,
    gloss: 0.6,
  });

  const entity = new pc.Entity('launcher');
  entity.setLocalPosition(spec.x, spec.y, 0);
  entity.tags.add('obstacle', 'launcher');

  entity.addComponent('collision', {
    type: 'box',
    halfExtents: new pc.Vec3(spec.width, spec.height, context.config.depth * 0.5),
  });
  // No rigidbody: PlayCanvas treats a bare collision volume as a trigger, so
  // marbles pass through and are kicked rather than blocked.

  entity.addChild(buildPad(spec, material));

  // Impulse is precomputed in board-local space: it never varies per hit, so
  // the launch is a property of the track rather than of the collision.
  const localImpulse = new pc.Vec3(spec.lateral * spec.strength, spec.strength, 0);
  const baseImpulse = new pc.Vec3();
  const worldImpulse = new pc.Vec3();
  context.boardRotation.transformVector(localImpulse, baseImpulse);

  let clock = 0;
  const firedAt = new Map<string, number>();

  entity.collision?.on('triggerenter', (other: pc.Entity) => {
    const body = other.rigidbody;
    if (!body || body.type !== pc.BODYTYPE_DYNAMIC) return;

    // Without a cooldown a marble hovering in the volume is re-launched every
    // step and never leaves.
    const last = firedAt.get(other.name);
    if (last !== undefined && clock - last < COOLDOWN_SECONDS) return;
    firedAt.set(other.name, clock);

    // Scaled by the marble's launch fatigue, so one caught in a pocket loses
    // height each time and eventually falls through instead of looping forever.
    const scale = context.launchScaleFor?.(other) ?? 1;
    worldImpulse.copy(baseImpulse).mulScalar(scale);

    body.activate();
    body.applyImpulse(worldImpulse.x, worldImpulse.y, worldImpulse.z);
    context.onLaunch?.(other);
  });

  return {
    entity,
    update(dt: number) {
      clock += dt;
    },
  };
}

/** A glowing chevron pointing up-board, so the pad reads as "this throws you back". */
function buildPad(spec: LauncherSpec, material: pc.StandardMaterial): pc.Entity {
  const pad = new pc.Entity('launcher-pad');

  const base = new pc.Entity('launcher-base');
  base.addComponent('render', { type: 'box', material, castShadows: false });
  base.setLocalScale(spec.width * 1.8, 0.26, 0.45);
  base.setLocalPosition(0, -spec.height * 0.7, 0);
  pad.addChild(base);

  // Two angled bars forming an upward arrow.
  // Sized to the trigger volume, so the graphic shows where the kick zone
  // actually is rather than overstating it.
  const armLength = spec.width * 0.95;
  for (const side of [-1, 1] as const) {
    const arm = new pc.Entity('launcher-arm');
    arm.addComponent('render', { type: 'box', material, castShadows: false });
    arm.setLocalScale(armLength, 0.24, 0.4);
    arm.setLocalPosition(side * spec.width * 0.4, -spec.height * 0.05, 0);
    arm.setLocalEulerAngles(0, 0, side * -38);
    pad.addChild(arm);
  }

  return pad;
}
