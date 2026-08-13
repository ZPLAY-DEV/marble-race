import * as pc from 'playcanvas';
import { SURFACE } from '../../physics/PhysicsConfig';
import { SCENE_COLORS } from '../../visual/Palette';
import type { LogoBarSpec } from '../TrackLayout';
import { type Obstacle, type ObstacleContext, createStaticBox } from './Obstacle';

/**
 * One stroke of the ZPLAY wordmark below the start gate.
 *
 * Geometrically it is nothing more than a slanted wall, and it deliberately
 * uses the same wall surface: the letters are a real barrier the field has to
 * find its way through, not a backdrop. What separates them is the material —
 * the gate's sky blue, lit hard — so the whole shape reads as a lit sign rather
 * than as an obstacle type a viewer has to learn.
 *
 * All the geometry that keeps this safe lives in TrackGenerator's LOGO block:
 * the tilt that keeps every stroke off level, and the letter proportions that
 * keep every counter too narrow for a marble to get inside.
 */
export function createLogoBar(spec: LogoBarSpec, context: ObstacleContext): Obstacle {
  const material = context.materials.get({
    color: SCENE_COLORS.logo,
    emissive: SCENE_COLORS.logoEmissive,
    emissiveIntensity: 0.95,
    metalness: 0.35,
    gloss: 0.9,
  });

  const entity = createStaticBox(
    'logo-bar',
    new pc.Vec3(spec.length, spec.thickness, context.config.depth * 0.9),
    material,
    SURFACE.wall,
  );
  entity.setLocalPosition(spec.x, spec.y, 0);
  entity.setLocalEulerAngles(0, 0, spec.angle);
  entity.tags.add('obstacle');
  return { entity };
}
