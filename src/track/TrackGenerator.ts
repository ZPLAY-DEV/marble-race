import type { RandomStream } from '../random/RandomManager';
import { clamp } from '../util/math';
import { type TrackConfig, rowCount } from './TrackConfig';
import type { ObstacleKind, ObstacleSpec, TrackLayout, TrackRow } from './TrackLayout';

/**
 * Builds a track layout from a seeded stream (PRD §8). Pure: takes numbers,
 * returns data. No PlayCanvas, no entities — the same generator could run on a
 * server to verify a result.
 *
 * The design goal is *unpredictable but fair* (PRD §27). Every row is
 * symmetric in distribution rather than in placement: no lane is systematically
 * favoured, but no two rows look the same either.
 */

/** Relative frequency of each obstacle kind in the mid-track pool. */
const ROW_WEIGHTS: Record<ObstacleKind, number> = {
  bumper: 5,
  slantedWall: 3,
  verticalWall: 2,
  narrowPassage: 2,
  splitter: 3,
  funnel: 1.5,
  rotor: 2,
  deflector: 1.5,
  launcher: 4,
  // Never drawn from the random pool: melt balls are placed as a deliberate
  // barrier across the middle of the board, not scattered as a row type.
  meltBall: 0,
};

const KINDS = Object.keys(ROW_WEIGHTS) as ObstacleKind[];

/**
 * Launch impulse range, in units/s applied to a 1kg marble.
 *
 * Height off a pad goes with the square of velocity, so these values sit at
 * roughly twice the old ones to give about four times the climb — a marble can
 * be thrown back up a good fraction of the board. `PhysicsConfig.maxSpeed` has
 * to stay above the maximum here or launches would be silently clipped, and
 * MIN_COLLIDER_THICKNESS has to stay above `maxSpeed * FIXED_TIMESTEP`.
 * tests/physicsInvariants.test.ts holds both relationships.
 */
const LAUNCH_STRENGTH = { min: 27, max: 42 } as const;

/** Edge-lane kicks, slightly softer since they also push inward. */
const EDGE_LAUNCH_STRENGTH = { min: 24, max: 37 } as const;

/**
 * Clear space that must remain between adjacent launch pads in a row.
 *
 * Comfortably more than a marble's diameter (0.84). Pads packed tighter than
 * this form an unbroken kicker wall: marbles get thrown back up faster than
 * they can fall through, and the field simply never descends.
 */
const MIN_LAUNCHER_GAP = 2.2;

/** Fraction of a row slot a pad may occupy, before the gap rule is applied. */
const LAUNCHER_PAD_RATIO = 0.3;

/** The melting barrier across the middle of the board. */
const MELT_BALL = {
  radius: 0.62,
  /** Clearance between neighbours — far narrower than a marble, by design. */
  gap: 0.16,
  rows: 2,
  rowSpacing: 1.5,
  meltSeconds: 2,
} as const;

/**
 * Kinds that constrict the track. Two in a row makes marbles pile up and the
 * race stall, so the generator refuses to place them back to back.
 */
const CONSTRICTING: ReadonlySet<ObstacleKind> = new Set(['funnel', 'narrowPassage']);

export function generateTrack(
  random: RandomStream,
  config: TrackConfig,
  seed: number,
): TrackLayout {
  const rows: TrackRow[] = [];
  const total = rowCount(config);
  let previousKind: ObstacleKind | null = null;

  for (let index = 0; index < total; index++) {
    const y = config.firstRowY - index * config.rowSpacing;

    // The first two rows are always bumper fields: marbles need to be spread
    // out of their starting grid before anything more structured is fair.
    // Launchers are excluded from the run-in above the finish, so a race can
    // always resolve (see `launcherFreeRunIn`).
    const kind: ObstacleKind =
      index < 2 ? 'bumper' : pickKind(random, previousKind, allowsLauncher(config, y));
    rows.push({ y, obstacles: buildRow(random, config, kind, y) });
    previousKind = kind;
  }

  // A final bumper field just above the finish keeps the last moments busy and
  // stops a leader from coasting home unchallenged (PRD §27).
  const finalY = config.finishY + config.finishHeight + config.rowSpacing;
  rows.push({ y: finalY, obstacles: buildRow(random, config, 'bumper', finalY) });

  rows.push(...buildEdgeLaunchers(random, config));
  rows.push(...buildMeltWall(random, config));
  rows.sort((a, b) => b.y - a.y);

  return { seed: seed >>> 0, width: config.width, rows };
}

/**
 * Kickers tucked into the side lanes, all the way down the board.
 *
 * The drain lanes exist so nothing can dead-end against a wall, but they were
 * also a quiet route home: a marble that found an edge could coast the length
 * of the track untouched. These fill the corners without reintroducing the
 * dead-end problem, because a launcher is a trigger and blocks nothing.
 *
 * Sides alternate rather than mirror, so the two edges are never the same run.
 */
function buildEdgeLaunchers(random: RandomStream, config: TrackConfig): TrackRow[] {
  const rows: TrackRow[] = [];
  const laneX = config.width / 2 - config.minDrainGap * 0.45;
  const top = config.firstRowY - config.launcherFreeStart;
  const bottom = config.finishY + config.finishHeight + config.launcherFreeRunIn;

  let index = 0;
  for (let y = top; y > bottom; y -= config.edgeLauncherSpacing) {
    // Alternate sides, but let the seed flip the phase and occasionally double up.
    const side = index % 2 === 0 ? -1 : 1;
    const both = random.chance(0.28);
    const jitterY = random.spread(config.edgeLauncherSpacing * 0.18);

    const sides = both ? ([-1, 1] as const) : ([side] as const);
    const obstacles: ObstacleSpec[] = sides.map((s) => ({
      kind: 'launcher' as const,
      x: s * laneX,
      y: y + jitterY,
      width: config.minDrainGap * 0.5,
      height: random.range(1.1, 1.6),
      // Edge kicks bias inward, pulling marbles off the wall and back into play.
      strength: random.range(EDGE_LAUNCH_STRENGTH.min, EDGE_LAUNCH_STRENGTH.max),
      lateral: -s * random.range(0.25, 0.6),
    }));

    rows.push({ y: y + jitterY, obstacles });
    index++;
  }

  return rows;
}

/**
 * Two near-solid rows of melting balls across the middle of the board.
 *
 * Deliberately packed almost edge to edge, which would be unthinkable for any
 * permanent obstacle: the field arrives at a wall it cannot get through and has
 * to melt a hole in it. The two rows are offset by half a ball so the gaps in
 * one line up with the balls in the other, leaving no straight path through
 * until something dissolves.
 */
function buildMeltWall(random: RandomStream, config: TrackConfig): TrackRow[] {
  const centreY = (config.firstRowY + config.finishY) / 2;
  const radius = MELT_BALL.radius;
  const pitch = radius * 2 + MELT_BALL.gap;
  const perRow = Math.floor(config.width / pitch);
  const rows: TrackRow[] = [];

  for (let line = 0; line < MELT_BALL.rows; line++) {
    const y = centreY - line * MELT_BALL.rowSpacing;
    // Offset alternate rows by half a pitch so the two interlock.
    const offset = line % 2 === 0 ? 0 : pitch / 2;
    const span = perRow * pitch;
    const startX = -span / 2 + pitch / 2 + offset;

    const balls: ObstacleSpec[] = [];
    for (let i = 0; i < perRow; i++) {
      const x = startX + i * pitch;
      if (Math.abs(x) + radius > config.width / 2) continue;
      balls.push({
        kind: 'meltBall',
        x,
        y: y + random.spread(0.12),
        radius,
        meltSeconds: MELT_BALL.meltSeconds,
      });
    }
    if (balls.length) rows.push({ y, obstacles: balls });
  }

  return rows;
}

/**
 * True where a launcher may be placed: below the opening drop, above the
 * finish run-in. Both ends are kept clear so a race can always start and
 * always end (see `launcherFreeStart` / `launcherFreeRunIn`).
 */
export function allowsLauncher(config: TrackConfig, y: number): boolean {
  const belowStart = y < config.firstRowY - config.launcherFreeStart;
  const aboveFinish = y > config.finishY + config.finishHeight + config.launcherFreeRunIn;
  return belowStart && aboveFinish;
}

function pickKind(
  random: RandomStream,
  previous: ObstacleKind | null,
  launcherAllowed: boolean,
): ObstacleKind {
  return random.weighted(KINDS, (kind) => {
    // Hard exclusions first — otherwise a funnel following a funnel escapes
    // through the repeat branch below.
    if (kind === 'launcher' && !launcherAllowed) return 0;
    if (previous && CONSTRICTING.has(kind) && CONSTRICTING.has(previous)) return 0;
    // Back-to-back kicker rows throw marbles up faster than they can fall
    // through, so repeats are heavily discouraged.
    if (kind === previous) return ROW_WEIGHTS[kind] * 0.2;
    return ROW_WEIGHTS[kind];
  });
}

function buildRow(
  random: RandomStream,
  config: TrackConfig,
  kind: ObstacleKind,
  y: number,
): ObstacleSpec[] {
  const halfWidth = config.width / 2;

  switch (kind) {
    case 'bumper':
      return buildBumperRow(random, config, y);

    case 'slantedWall': {
      // Two opposing ramps that steer marbles toward the middle or the edges,
      // chosen per row so the bias flips from race to race.
      const inward = random.chance(0.5);
      const angle = random.range(22, 40) * (inward ? 1 : -1);
      const centre = halfWidth * 0.5;

      // A ramp that reaches the wall is a dead end, so cap its length by the
      // clearance still available outboard of its centre.
      const maxHalfSpan = (halfWidth - config.minDrainGap - centre) /
        Math.cos((angle * Math.PI) / 180);
      const length = Math.min(
        random.range(halfWidth * 0.55, halfWidth * 0.85),
        Math.max(1.2, maxHalfSpan * 2),
      );

      return [
        { kind: 'slantedWall', x: -centre, y, length, angle },
        { kind: 'slantedWall', x: centre, y, length, angle: -angle },
      ];
    }

    case 'verticalWall': {
      const count = random.int(2, 3);
      const walls: ObstacleSpec[] = [];
      const step = config.width / (count + 1);
      const jitter = step * 0.18;
      const limit = halfWidth - config.minDrainGap;
      for (let i = 1; i <= count; i++) {
        walls.push({
          kind: 'verticalWall',
          x: clamp(-halfWidth + step * i + random.spread(jitter), -limit, limit),
          y,
          length: random.range(2.4, 4.2),
        });
      }
      return walls;
    }

    case 'narrowPassage':
      return [
        {
          kind: 'narrowPassage',
          x: random.spread(halfWidth * 0.35),
          y,
          // Proportional to the board: a fixed gap on a wider board is a much
          // harsher constriction than the same number on a narrow one.
          gap: config.width * random.range(0.16, 0.24),
        },
      ];

    case 'splitter': {
      const count = random.int(2, 3);
      const step = config.width / count;
      const splitters: ObstacleSpec[] = [];
      const jitter = step * 0.12;
      // Two adjacent wedges form a V between their bases. Sized carelessly that
      // V closes to less than a marble and catches the field, so cap the width
      // by what the row spacing can actually accommodate, worst-case jitter
      // included.
      const widthCeiling = clamp(step - 2 * jitter - config.minDrainGap, 1.75, 2.6);

      for (let i = 0; i < count; i++) {
        const width = random.range(1.7, widthCeiling);
        // The outer face must not run into the wall either.
        const limit = halfWidth - config.minDrainGap - width / 2;
        splitters.push({
          kind: 'splitter',
          x: clamp(-halfWidth + step * (i + 0.5) + random.spread(jitter), -limit, limit),
          y,
          width,
          height: random.range(1.3, 2.0),
        });
      }
      return splitters;
    }

    case 'funnel': {
      // The mouth is derived, not chosen: it must reach past both side walls.
      // A mouth narrower than the board leaves a pocket between its outer tip
      // and the wall, and a marble that falls into one is held there for the
      // rest of the race. Spanning the full width is also what a funnel is for
      // — everything arriving gets gathered into the throat.
      const offset = random.spread(halfWidth * 0.12);
      const mouth = 2 * (halfWidth + Math.abs(offset) + 0.8);

      return [
        {
          kind: 'funnel',
          x: offset,
          y,
          mouth,
          throat: config.width * random.range(0.15, 0.21),
          height: random.range(3.0, 4.2),
        },
      ];
    }

    case 'rotor': {
      const count = random.int(1, 2);
      const rotors: ObstacleSpec[] = [];
      const step = config.width / count;
      for (let i = 0; i < count; i++) {
        const length = random.range(3.4, 4.6);
        // A paddle that sweeps into the wall pins marbles against it.
        const limit = Math.max(0, halfWidth - config.minDrainGap - length / 2);
        rotors.push({
          kind: 'rotor',
          x: clamp(-halfWidth + step * (i + 0.5), -limit, limit),
          y,
          length,
          speed: random.range(70, 130) * (random.chance(0.5) ? 1 : -1),
          phase: random.range(0, 360),
        });
      }
      return rotors;
    }

    case 'launcher': {
      // A bank of kickers with real gaps between them.
      //
      // `width` is a half-extent, so a pad occupies 2 x width. Sized greedily
      // the pads merge into a continuous wall and nothing can get past — the
      // board stops being a race. LAUNCHER_PAD_RATIO leaves each gap at least
      // MIN_LAUNCHER_GAP wide so there is always a way down.
      const count = random.int(2, 3);
      const step = config.width / count;
      const jitter = step * 0.1;
      const maxHalfWidth = (step - MIN_LAUNCHER_GAP - 2 * jitter) / 2;
      const width = Math.max(0.55, Math.min(step * LAUNCHER_PAD_RATIO, maxHalfWidth));
      const launchers: ObstacleSpec[] = [];

      for (let i = 0; i < count; i++) {
        launchers.push({
          kind: 'launcher',
          x: -halfWidth + step * (i + 0.5) + random.spread(jitter),
          y: y + random.spread(0.8),
          width,
          height: random.range(0.85, 1.2),
          strength: random.range(LAUNCH_STRENGTH.min, LAUNCH_STRENGTH.max),
          lateral: random.range(-0.45, 0.45),
        });
      }
      return launchers;
    }

    case 'deflector': {
      const count = random.int(2, 3);
      const deflectors: ObstacleSpec[] = [];
      const step = config.width / count;
      for (let i = 0; i < count; i++) {
        deflectors.push({
          kind: 'deflector',
          x: -halfWidth + step * (i + 0.5) + random.spread(step * 0.15),
          y,
          radius: random.range(1.1, 1.6),
          strength: random.range(2.2, 4.0),
        });
      }
      return deflectors;
    }

    case 'meltBall':
      // Melt balls are a deliberate barrier placed by buildMeltWall, never a
      // randomly chosen row. Reaching here means the weight table was edited.
      throw new Error('meltBall is placed directly, not drawn as a random row');

    default: {
      const exhaustive: never = kind;
      throw new Error(`Unhandled obstacle kind: ${String(exhaustive)}`);
    }
  }
}

/**
 * A staggered peg field. Rows alternate offset like a real pachinko board, so
 * a marble falling straight down always meets a peg rather than a gap.
 */
function buildBumperRow(
  random: RandomStream,
  config: TrackConfig,
  y: number,
): ObstacleSpec[] {
  const count = Math.round(config.width / random.range(2.6, 3.6));
  const step = config.width / count;
  const offset = random.chance(0.5) ? step * 0.5 : 0;
  const bumpers: ObstacleSpec[] = [];

  for (let i = 0; i < count; i++) {
    const x = -config.width / 2 + step * (i + 0.5) + offset;
    const radius = random.range(0.42, 0.62);
    // Drop pegs that would leave less than a full drain gap to the wall. Half a
    // gap is narrower than a marble, so the peg becomes a wedge against the wall
    // rather than an obstacle to bounce off.
    if (Math.abs(x) + radius > config.width / 2 - config.minDrainGap) continue;
    bumpers.push({
      kind: 'bumper',
      x,
      y: y + random.spread(0.35),
      radius,
    });
  }
  return bumpers;
}
