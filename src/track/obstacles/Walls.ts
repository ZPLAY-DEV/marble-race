import * as pc from 'playcanvas';
import { SURFACE } from '../../physics/PhysicsConfig';
import { SCENE_COLORS } from '../../visual/Palette';
import type { NarrowPassageSpec, SlantedWallSpec, VerticalWallSpec } from '../TrackLayout';
import { type Obstacle, type ObstacleContext, createStaticBox } from './Obstacle';

const WALL_THICKNESS = 0.62;

/**
 * Minimum tilt, in degrees, for any surface a marble could come to rest on.
 *
 * On an inclined board, a face whose normal is board-local +Y is level: the
 * contact normal absorbs the whole down-board component of gravity, and the
 * only force left presses the marble into the board face. That corner holds a
 * marble permanently — not even a rescue impulse reliably frees it, because it
 * settles straight back. Nothing in the track may be level.
 */
const LEDGE_TILT = 12;

/** Angled ramp that steers the marble stream sideways. */
export function createSlantedWall(
  spec: SlantedWallSpec,
  context: ObstacleContext,
): Obstacle {
  const material = context.materials.get({
    color: SCENE_COLORS.slantedWall,
    emissiveIntensity: 0.22,
    metalness: 0.55,
    gloss: 0.7,
  });

  const entity = createStaticBox(
    'slanted-wall',
    new pc.Vec3(spec.length, WALL_THICKNESS, context.config.depth * 0.9),
    material,
    SURFACE.wall,
  );
  entity.setLocalPosition(spec.x, spec.y, 0);
  entity.setLocalEulerAngles(0, 0, spec.angle);
  entity.tags.add('obstacle');
  return { entity };
}

/**
 * Lane divider running down the board.
 *
 * Tilted a few degrees rather than left truly vertical. A perfectly upright
 * wall presents a level top face, and on an inclined board a level face is a
 * trap: the normal force cancels gravity's entire down-board component, so a
 * marble that lands on it has nothing left to push it off. See LEDGE_TILT.
 */
export function createVerticalWall(
  spec: VerticalWallSpec,
  context: ObstacleContext,
): Obstacle {
  const material = context.materials.get({
    color: SCENE_COLORS.verticalWall,
    emissiveIntensity: 0.18,
    metalness: 0.5,
    gloss: 0.65,
  });

  const entity = createStaticBox(
    'vertical-wall',
    new pc.Vec3(WALL_THICKNESS, spec.length, context.config.depth * 0.9),
    material,
    SURFACE.wall,
  );
  entity.setLocalPosition(spec.x, spec.y, 0);
  entity.setLocalEulerAngles(0, 0, spec.x >= 0 ? LEDGE_TILT : -LEDGE_TILT);
  entity.tags.add('obstacle');
  return { entity };
}

/**
 * Two blocks leaving a gap. Built as one obstacle so the generator can reason
 * about the opening rather than about two independent walls.
 *
 * Each block slopes down toward the opening. Level blocks here were the single
 * worst trap on the board — a full-width shelf that collected marbles until the
 * race timed out. Sloping them turns the same barrier into a feeder that
 * gathers marbles into the gap, which is what it was always meant to do.
 */
export function createNarrowPassage(
  spec: NarrowPassageSpec,
  context: ObstacleContext,
): Obstacle {
  const material = context.materials.get({
    color: SCENE_COLORS.narrowPassage,
    emissiveIntensity: 0.35,
    metalness: 0.4,
    gloss: 0.8,
  });

  const group = new pc.Entity('narrow-passage');
  group.setLocalPosition(spec.x, spec.y, 0);

  const half = context.config.width / 2;
  const gapHalf = spec.gap / 2;
  const depth = context.config.depth * 0.9;

  // Each side spans from the board edge to the edge of the opening, sloping
  // down toward the gap so nothing can settle on top.
  for (const side of [-1, 1] as const) {
    const inner = gapHalf;
    const outer = half - spec.x * side;
    const length = Math.max(0.4, outer - inner);
    const block = createStaticBox(
      'passage-block',
      new pc.Vec3(length, WALL_THICKNESS * 1.6, depth),
      material,
      SURFACE.wall,
    );
    block.setLocalPosition(side * (inner + length / 2), 0, 0);
    // Rotating by `side * LEDGE_TILT` drops each block's inner end, so both
    // slopes run downhill into the opening.
    block.setLocalEulerAngles(0, 0, side * LEDGE_TILT);
    group.addChild(block);
  }

  group.tags.add('obstacle');
  return { entity: group };
}
