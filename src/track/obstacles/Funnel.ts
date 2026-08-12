import * as pc from 'playcanvas';
import { SURFACE } from '../../physics/PhysicsConfig';
import { SCENE_COLORS } from '../../visual/Palette';
import type { FunnelSpec } from '../TrackLayout';
import { type Obstacle, type ObstacleContext, createStaticBox } from './Obstacle';

/**
 * Converging walls that squeeze the field into a throat, then release it.
 *
 * The strongest pacing tool on the board: it bunches marbles together so the
 * order coming out is genuinely unsettled, which is what keeps a race worth
 * watching to the end (PRD §27).
 */
export function createFunnel(spec: FunnelSpec, context: ObstacleContext): Obstacle {
  const material = context.materials.get({
    color: SCENE_COLORS.funnel,
    emissiveIntensity: 0.35,
    metalness: 0.35,
    gloss: 0.8,
  });

  const group = new pc.Entity('funnel');
  group.setLocalPosition(spec.x, spec.y, 0);

  const depth = context.config.depth * 0.9;
  const run = (spec.mouth - spec.throat) / 2;
  const faceLength = Math.hypot(run, spec.height);
  const angle = (Math.atan2(spec.height, run) * 180) / Math.PI;

  for (const side of [-1, 1] as const) {
    const face = createStaticBox(
      'funnel-face',
      new pc.Vec3(faceLength, 0.62, depth),
      material,
      SURFACE.wall,
    );
    // Built downward from the row line: the mouth sits at y=0 and the throat
    // below it. Building upward made the mouth intrude into the row above,
    // leaving a marble-high slot between the two that trapped whole groups
    // against the side wall.
    // Shifting the funnel down is a pure translation — the face orientation is
    // unchanged. Flipping the angle too inverts it into a tent that dams the
    // board instead of gathering into the throat.
    face.setLocalPosition((side * (spec.mouth + spec.throat)) / 4, -spec.height / 2, 0);
    face.setLocalEulerAngles(0, 0, side * angle);
    group.addChild(face);
  }

  group.tags.add('obstacle');
  return { entity: group };
}
