import * as pc from 'playcanvas';
import type { MaterialFactory } from '../visual/MaterialFactory';
import { SCENE_COLORS } from '../visual/Palette';
import type { TrackConfig } from './TrackConfig';

export type FinishCallback = (entity: pc.Entity) => void;

/**
 * Trigger volume across the bottom of the board (PRD §10).
 *
 * It reports *every* entry, including repeats — de-duplication is RankingManager's
 * job, not the trigger's. Keeping the physics side dumb is what lets the
 * ranking rule be tested without a physics engine.
 */
export function createFinishZone(
  config: TrackConfig,
  materials: MaterialFactory,
  onEnter: FinishCallback,
): pc.Entity {
  const zone = new pc.Entity('finish-zone');
  zone.setLocalPosition(0, config.finishY, 0);

  zone.addComponent('collision', {
    type: 'box',
    halfExtents: new pc.Vec3(config.width / 2, config.finishHeight / 2, config.depth),
  });
  zone.collision?.on('triggerenter', onEnter);

  // Chequered-feeling finish band: alternating emissive blocks, no textures.
  const bandY = config.finishHeight / 2;
  const segments = 12;
  const segmentWidth = config.width / segments;
  for (let i = 0; i < segments; i++) {
    const light = i % 2 === 0;
    const material = materials.get({
      color: light ? SCENE_COLORS.finishLine : SCENE_COLORS.finishGlow,
      emissiveIntensity: light ? 0.9 : 0.7,
      metalness: 0.1,
      gloss: 0.8,
    });
    const block = new pc.Entity('finish-block');
    block.addComponent('render', { type: 'box', material, castShadows: false });
    block.setLocalScale(segmentWidth, 0.5, config.depth * 0.4);
    block.setLocalPosition(
      -config.width / 2 + segmentWidth * (i + 0.5),
      bandY,
      -config.depth * 0.3,
    );
    zone.addChild(block);
  }

  return zone;
}

/**
 * A catcher basin below the finish line so marbles settle on screen instead of
 * falling out of the world during the result screen.
 */
export function createCatcher(config: TrackConfig, materials: MaterialFactory): pc.Entity {
  const material = materials.get({
    color: SCENE_COLORS.board,
    metalness: 0.2,
    gloss: 0.4,
  });

  const catcher = new pc.Entity('catcher');
  const floorY = config.finishY - config.finishHeight * 2;

  const floor = new pc.Entity('catcher-floor');
  floor.addComponent('render', { type: 'box', material, castShadows: false });
  floor.setLocalScale(config.width, 0.6, config.depth * 2);
  floor.setLocalPosition(0, floorY, 0);
  floor.addComponent('collision', {
    type: 'box',
    halfExtents: new pc.Vec3(config.width / 2, 0.3, config.depth),
  });
  floor.addComponent('rigidbody', { type: 'static', friction: 0.9, restitution: 0.05 });
  catcher.addChild(floor);

  return catcher;
}
