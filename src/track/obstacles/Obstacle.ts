import * as pc from 'playcanvas';
import type { MaterialFactory } from '../../visual/MaterialFactory';
import type { RandomStream } from '../../random/RandomManager';
import type { TrackConfig } from '../TrackConfig';

/**
 * Everything an obstacle module needs in order to build itself. Passing one
 * context keeps every obstacle's factory signature identical, so Track can
 * dispatch over them without special cases.
 */
export interface ObstacleContext {
  materials: MaterialFactory;
  config: TrackConfig;
  /** Seeded stream for runtime randomness (deflector kicks). */
  random: RandomStream;
  /**
   * Board-to-world rotation. Obstacles that apply forces express them in
   * board-local space and convert with this, rather than reading their own
   * world rotation — a piece with a local tilt of its own would otherwise
   * push in a direction its geometry happens to define.
   */
  boardRotation: pc.Quat;
  /** Notifies the game that a marble was launched, for sound and effects. */
  onLaunch?: (marble: pc.Entity) => void;
  /**
   * Multiplier for a launch impulse, from the marble's accumulated launch
   * fatigue. Keeps the "stop marbles looping forever" rule with the marble
   * rather than duplicated across every pad.
   */
  launchScaleFor?: (marble: pc.Entity) => number;
  /** Notifies the game that a pop bumper fired, with its new heat level. */
  onBumperHit?: (marble: pc.Entity, level: number) => void;
  /** Notifies the game that a melt ball began dissolving. */
  onMeltStart?: (marble: pc.Entity) => void;
}

/**
 * A built obstacle. `update` is optional and, when present, is called on the
 * fixed physics step — never on the render frame — so moving obstacles stay
 * deterministic.
 */
export interface Obstacle {
  entity: pc.Entity;
  update?(dt: number): void;
  /**
   * Optional render-only entity parented alongside `entity` rather than under
   * it — used where decoration must not inherit the collider's motion.
   */
  decoration?: pc.Entity;
}

/** Collision group for pieces that only ever block marbles. */
export const GROUP_TRACK = pc.BODYGROUP_STATIC;

/**
 * Builds a static box with matching render and collision volumes.
 * Physics uses primitive colliders exclusively (PRD §19) — no mesh colliders.
 */
export function createStaticBox(
  name: string,
  size: pc.Vec3,
  material: pc.StandardMaterial,
  surface: { friction: number; restitution: number },
): pc.Entity {
  const entity = new pc.Entity(name);
  entity.addComponent('render', { type: 'box', material, castShadows: true });
  entity.setLocalScale(size.x, size.y, size.z);

  entity.addComponent('collision', {
    type: 'box',
    halfExtents: new pc.Vec3(size.x / 2, size.y / 2, size.z / 2),
  });
  entity.addComponent('rigidbody', {
    type: 'static',
    friction: surface.friction,
    restitution: surface.restitution,
  });
  return entity;
}

/**
 * Builds a cylinder standing along the board normal (local Z).
 * PlayCanvas cylinders point along Y, so the mesh is rotated into place while
 * the collider is described in its own local axis.
 */
export function createPeg(
  name: string,
  radius: number,
  depth: number,
  material: pc.StandardMaterial,
  surface: { friction: number; restitution: number },
): pc.Entity {
  const entity = new pc.Entity(name);

  const mesh = new pc.Entity(`${name}-mesh`);
  mesh.addComponent('render', { type: 'cylinder', material, castShadows: true });
  mesh.setLocalScale(radius * 2, depth, radius * 2);
  mesh.setLocalEulerAngles(90, 0, 0);
  entity.addChild(mesh);

  entity.addComponent('collision', {
    type: 'cylinder',
    radius,
    height: depth,
    axis: 2, // Z — along the board normal
  });
  entity.addComponent('rigidbody', {
    type: 'static',
    friction: surface.friction,
    restitution: surface.restitution,
  });
  return entity;
}
