import * as pc from 'playcanvas';
import { SURFACE } from '../../physics/PhysicsConfig';
import { SCENE_COLORS } from '../../visual/Palette';
import type { SplitterSpec } from '../TrackLayout';
import { type Obstacle, type ObstacleContext, createStaticBox } from './Obstacle';

/**
 * A wedge that splits an incoming stream left and right.
 *
 * The visible shape is a cone, but collision is two angled boxes: a cone
 * collider would give a rounded apex where marbles balance and stall, and
 * primitive colliders are cheaper anyway (PRD §19).
 */
export function createSplitter(spec: SplitterSpec, context: ObstacleContext): Obstacle {
  const material = context.materials.get({
    color: SCENE_COLORS.splitter,
    emissiveIntensity: 0.4,
    metalness: 0.3,
    gloss: 0.75,
  });

  const group = new pc.Entity('splitter');
  group.setLocalPosition(spec.x, spec.y, 0);

  const depth = context.config.depth * 0.9;
  const faceLength = Math.hypot(spec.width / 2, spec.height);
  const angle = (Math.atan2(spec.height, spec.width / 2) * 180) / Math.PI;

  for (const side of [-1, 1] as const) {
    const face = createStaticBox(
      'splitter-face',
      new pc.Vec3(faceLength, 0.62, depth),
      material,
      SURFACE.splitter,
    );
    face.setLocalPosition((side * spec.width) / 4, spec.height / 2, 0);
    face.setLocalEulerAngles(0, 0, -side * angle);
    group.addChild(face);
  }

  group.tags.add('obstacle');
  return { entity: group };
}
