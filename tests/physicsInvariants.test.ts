import { describe, expect, it } from 'vitest';
import {
  bumperKick,
  DEFAULT_PHYSICS_CONFIG,
  FIXED_TIMESTEP,
  MAX_FRAME_DELTA,
  MAX_STEPS_PER_FRAME,
  MIN_COLLIDER_THICKNESS,
} from '../src/physics/PhysicsConfig';
import { DEFAULT_GAME_CONFIG } from '../src/core/GameConfig';
import { DEFAULT_NAMES } from '../src/marble/MarbleConfig';
import { RandomManager, STREAM } from '../src/random/RandomManager';
import { boardExtent, DEFAULT_TRACK_CONFIG, START_GRID } from '../src/track/TrackConfig';
import { generateTrack } from '../src/track/TrackGenerator';
import { BUMPER_HEAT_STEPS, bumperHeatColor, bumperHeatEmissive } from '../src/visual/Palette';
import { allObstacles } from '../src/track/TrackLayout';

describe('physics invariants', () => {
  it('cannot tunnel a marble through the thinnest collider in one step', () => {
    // PlayCanvas 2.21 exposes no CCD, so this relationship is what keeps
    // marbles inside the track. Raising maxSpeed or the timestep breaks it.
    const travelPerStep = DEFAULT_PHYSICS_CONFIG.maxSpeed * FIXED_TIMESTEP;
    expect(travelPerStep).toBeLessThan(MIN_COLLIDER_THICKNESS);
  });

  it('lets the strongest launch reach full speed without being clipped', () => {
    // A launch impulse above maxSpeed would be silently truncated by the speed
    // clamp, quietly capping the bounce height the track was tuned for.
    const strongest = Math.max(
      ...allObstacles(
        generateTrack(
          new RandomManager(4242).stream(STREAM.track),
          DEFAULT_TRACK_CONFIG,
          4242,
        ),
      )
        .filter((o) => o.kind === 'launcher')
        .map((o) => o.strength),
    );
    expect(strongest).toBeLessThanOrEqual(DEFAULT_PHYSICS_CONFIG.maxSpeed);
  });

  it('keeps a launcher-free run-in so races can always resolve', () => {
    // Without it, a marble arriving at the line can be thrown back up forever.
    const runIn = DEFAULT_TRACK_CONFIG.launcherFreeRunIn;
    expect(runIn).toBeGreaterThan(0);

    const cutoff =
      DEFAULT_TRACK_CONFIG.finishY + DEFAULT_TRACK_CONFIG.finishHeight + runIn;
    for (let seed = 0; seed < 30; seed++) {
      const layout = generateTrack(
        new RandomManager(seed).stream(STREAM.track),
        DEFAULT_TRACK_CONFIG,
        seed,
      );
      for (const obstacle of allObstacles(layout)) {
        if (obstacle.kind !== 'launcher') continue;
        expect(obstacle.y).toBeGreaterThan(cutoff - 2);
      }
    }
  });

  it('leaves the marble smaller than the board cavity', () => {
    // A marble wider than the gap between the board face and the front glass
    // would jam permanently.
    const diameter = DEFAULT_PHYSICS_CONFIG.marbleRadius * 2;
    expect(diameter).toBeLessThan(DEFAULT_TRACK_CONFIG.depth);
  });

  it('is too shallow for two marbles to stack front-to-back', () => {
    // A cavity deep enough for two lets marbles wedge each other against an
    // obstacle, in a jam no rescue impulse can clear. Single-file only.
    const diameter = DEFAULT_PHYSICS_CONFIG.marbleRadius * 2;
    expect(DEFAULT_TRACK_CONFIG.depth).toBeLessThan(diameter * 2);
    // ...but still comfortably wider than one, or marbles bind on the glass.
    expect(DEFAULT_TRACK_CONFIG.depth).toBeGreaterThan(diameter * 1.35);
  });

  it('fits at least four marbles across the narrowest funnel throat', () => {
    // Below this the field bottlenecks hard enough to stall (PRD §27).
    const narrowestThroat = 2.6;
    const diameter = DEFAULT_PHYSICS_CONFIG.marbleRadius * 2;
    expect(narrowestThroat / diameter).toBeGreaterThanOrEqual(3);
  });

  it('keeps the frame delta cap consistent with the step budget', () => {
    expect(MAX_FRAME_DELTA).toBeCloseTo(MAX_STEPS_PER_FRAME * FIXED_TIMESTEP, 10);
  });

  it('simulates at least twice per 60Hz frame, so 30fps still resolves cleanly', () => {
    expect(FIXED_TIMESTEP).toBeLessThanOrEqual(1 / 120);
    expect(MAX_STEPS_PER_FRAME * FIXED_TIMESTEP).toBeGreaterThanOrEqual(1 / 30);
  });

  it('gives the board enough run to be worth watching', () => {
    const { startY, finishY } = DEFAULT_TRACK_CONFIG;
    expect(startY - finishY).toBeGreaterThan(60);
  });

  it('encloses the start hopper for the largest supported field', () => {
    // Rows stacked above the board's top edge have no board behind them and no
    // glass in front, so those marbles fall straight out of the world. At 50
    // players this silently dropped two thirds of the field.
    const perRow = Math.floor(DEFAULT_TRACK_CONFIG.width / START_GRID.minSpacing);
    const rows = Math.ceil(DEFAULT_GAME_CONFIG.playerLimit / perRow);
    const topMarbleY =
      DEFAULT_TRACK_CONFIG.startY +
      (rows - 1) * START_GRID.rowPitch +
      DEFAULT_PHYSICS_CONFIG.marbleRadius;

    expect(topMarbleY).toBeLessThanOrEqual(boardExtent(DEFAULT_TRACK_CONFIG).top);
  });

  it('fits the whole default roster on a single start row', () => {
    // Overflow stacks into a second row above the first and is released a beat
    // late, through whatever gap the front row leaves — those marbles look like
    // they are refusing to fall. The board must be wide enough to avoid it.
    const perRow = Math.floor(DEFAULT_TRACK_CONFIG.width / START_GRID.minSpacing);
    expect(perRow).toBeGreaterThanOrEqual(DEFAULT_NAMES.length);
  });

  it('spaces the start grid wider than a marble', () => {
    const perRow = Math.floor(DEFAULT_TRACK_CONFIG.width / START_GRID.minSpacing);
    const spacing = DEFAULT_TRACK_CONFIG.width / (perRow + 1);
    expect(spacing).toBeGreaterThan(DEFAULT_PHYSICS_CONFIG.marbleRadius * 2);
  });
});

describe('pop bumper heat', () => {
  it('doubles the kick at every step', () => {
    for (let level = 1; level < BUMPER_HEAT_STEPS; level++) {
      expect(bumperKick(level)).toBeCloseTo(bumperKick(level - 1) * 2, 6);
    }
  });

  it('tops out at exactly the speed cap, so the last step still bites', () => {
    // A ladder that overshot maxSpeed would be clipped by the speed clamp and
    // the final, reddest step would feel identical to the one before it.
    const strongest = bumperKick(BUMPER_HEAT_STEPS - 1);
    expect(strongest).toBeLessThanOrEqual(DEFAULT_PHYSICS_CONFIG.maxSpeed);
    expect(strongest).toBeGreaterThan(DEFAULT_PHYSICS_CONFIG.maxSpeed * 0.9);
  });

  it('gives every heat step its own colour', () => {
    const colours = Array.from({ length: BUMPER_HEAT_STEPS }, (_, i) => bumperHeatColor(i));
    expect(new Set(colours).size).toBe(BUMPER_HEAT_STEPS);
  });

  it('clamps colour and emissive outside the ladder', () => {
    expect(bumperHeatColor(-3)).toBe(bumperHeatColor(0));
    expect(bumperHeatColor(99)).toBe(bumperHeatColor(BUMPER_HEAT_STEPS - 1));
    expect(bumperHeatEmissive(99)).toBe(bumperHeatEmissive(BUMPER_HEAT_STEPS - 1));
  });

  it('glows hotter as it charges', () => {
    for (let level = 1; level < BUMPER_HEAT_STEPS; level++) {
      expect(bumperHeatEmissive(level)).toBeGreaterThan(bumperHeatEmissive(level - 1));
    }
  });
});
