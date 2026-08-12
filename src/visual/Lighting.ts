import * as pc from 'playcanvas';
import { LIGHT_COLORS, SCENE_COLORS, hexToRgb } from './Palette';

/**
 * Three-point lighting (PRD §21): a shadow-casting key, a cool fill to keep the
 * dark side of the board readable, and a warm rim that separates glossy marbles
 * from the backdrop. Without the rim, dark-on-dark marbles vanish.
 */
/** Fog range for normal play, and for the flattened whole-board view. */
export const FOG_NEAR = { start: 70, end: 190 } as const;
export const FOG_FAR = { start: 420, end: 1100 } as const;

export function setupLighting(app: pc.Application, root: pc.Entity): void {
  const [ar, ag, ab] = hexToRgb(LIGHT_COLORS.ambient);
  app.scene.ambientLight.set(ar, ag, ab);
  app.scene.skyboxIntensity = 0;

  const [br, bg, bb] = hexToRgb(SCENE_COLORS.background);
  // Fog gives the long board depth at normal zoom. Its range is pushed out as
  // the view flattens (see FOG_NEAR/FOG_FAR) — the fully zoomed-out camera sits
  // hundreds of units back, and a fixed range would fade the entire board to
  // the background colour, leaving nothing to look at.
  app.scene.fog.type = pc.FOG_LINEAR;
  app.scene.fog.start = FOG_NEAR.start;
  app.scene.fog.end = FOG_NEAR.end;
  app.scene.fog.color.set(br, bg, bb);

  const key = new pc.Entity('light-key');
  key.addComponent('light', {
    type: 'directional',
    color: new pc.Color(...hexToRgb(LIGHT_COLORS.key)),
    intensity: 1.5,
    castShadows: true,
    shadowDistance: 120,
    shadowResolution: 2048,
    shadowBias: 0.15,
    normalOffsetBias: 0.06,
    shadowType: pc.SHADOW_PCF3_32F,
  });
  key.setEulerAngles(52, 22, 0);
  root.addChild(key);

  const fill = new pc.Entity('light-fill');
  fill.addComponent('light', {
    type: 'directional',
    color: new pc.Color(...hexToRgb(LIGHT_COLORS.fill)),
    intensity: 0.55,
    castShadows: false,
  });
  fill.setEulerAngles(18, -140, 0);
  root.addChild(fill);

  const rim = new pc.Entity('light-rim');
  rim.addComponent('light', {
    type: 'directional',
    color: new pc.Color(...hexToRgb(LIGHT_COLORS.rim)),
    intensity: 0.8,
    castShadows: false,
  });
  rim.setEulerAngles(-24, 190, 0);
  root.addChild(rim);
}
