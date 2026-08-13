import { describe, expect, it } from 'vitest';
import { MIN_COLLIDER_THICKNESS } from '../src/physics/PhysicsConfig';
import { RandomManager, STREAM } from '../src/random/RandomManager';
import { DEFAULT_TRACK_CONFIG, rowCount } from '../src/track/TrackConfig';
import { generateTrack } from '../src/track/TrackGenerator';
import { allObstacles, type TrackLayout } from '../src/track/TrackLayout';

function build(seed: number): TrackLayout {
  const random = new RandomManager(seed);
  return generateTrack(random.stream(STREAM.track), DEFAULT_TRACK_CONFIG, seed);
}

describe('generateTrack', () => {
  it('is a pure function of the seed', () => {
    // Deep equality on the whole layout: this is the property that makes a
    // shared seed reproduce the same race (PRD §8, §9).
    expect(build(2024)).toEqual(build(2024));
  });

  it('produces different tracks for different seeds', () => {
    expect(JSON.stringify(build(1))).not.toBe(JSON.stringify(build(2)));
  });

  it('serialises to JSON without loss', () => {
    // The layout must stay plain data so a server or a track editor can carry it.
    const layout = build(77);
    expect(JSON.parse(JSON.stringify(layout))).toEqual(layout);
  });

  it('fills the board with at least the main obstacle rows', () => {
    const layout = build(5);
    // Main rows, the fixed bumper field above the finish, plus the interleaved
    // edge-launcher rows.
    expect(layout.rows.length).toBeGreaterThan(rowCount(DEFAULT_TRACK_CONFIG));
  });

  it('places every row inside the track, ordered down the board', () => {
    const layout = build(31);
    let previousY = Number.POSITIVE_INFINITY;

    for (const row of layout.rows) {
      // Edge-launcher rows are merged into the main sequence, so two rows may
      // land at the same height; the order must still never go back up.
      expect(row.y).toBeLessThanOrEqual(previousY);
      expect(row.y).toBeLessThanOrEqual(DEFAULT_TRACK_CONFIG.firstRowY);
      expect(row.y).toBeGreaterThan(DEFAULT_TRACK_CONFIG.finishY);
      previousY = row.y;
    }
  });

  it('keeps every obstacle within the playable width', () => {
    const half = DEFAULT_TRACK_CONFIG.width / 2;
    for (let seed = 0; seed < 40; seed++) {
      for (const obstacle of allObstacles(build(seed))) {
        expect(Math.abs(obstacle.x)).toBeLessThanOrEqual(half);
      }
    }
  });

  it('opens with the ZPLAY wordmark, which breaks up the starting grid', () => {
    // Edge-launcher rows interleave with the main sequence, so pick out the
    // main rows: the assertion is about what the field meets first, not about
    // list positions.
    const mainRows = build(404).rows.filter((row) =>
      row.obstacles.some((o) => o.kind !== 'launcher'),
    );

    expect(mainRows[0].obstacles.every((o) => o.kind === 'logoBar')).toBe(true);
  });

  it('never stacks two constricting rows in a row', () => {
    // Back-to-back funnels pile marbles up and stall the race.
    const constricting = new Set(['funnel', 'narrowPassage']);

    for (let seed = 0; seed < 60; seed++) {
      const rows = build(seed).rows;
      for (let i = 1; i < rows.length; i++) {
        const previous = rows[i - 1].obstacles[0]?.kind;
        const current = rows[i].obstacles[0]?.kind;
        if (!previous || !current) continue;
        expect(constricting.has(previous) && constricting.has(current)).toBe(false);
      }
    }
  });

  it('leaves a drain gap between every blocking obstacle and the side walls', () => {
    // The rule that keeps races finishing. An obstacle reaching the wall is a
    // dead end: a marble sliding along its face hits the wall and stops, with
    // no down-board force left to free it. Races used to time out because of it.
    const half = DEFAULT_TRACK_CONFIG.width / 2;
    const gap = DEFAULT_TRACK_CONFIG.minDrainGap;

    /** Outer reach of a blocking obstacle, or null if it drains elsewhere. */
    const outerReach = (obstacle: ReturnType<typeof allObstacles>[number]): number | null => {
      switch (obstacle.kind) {
        case 'slantedWall':
          return Math.abs(obstacle.x) +
            (obstacle.length / 2) * Math.cos((obstacle.angle * Math.PI) / 180);
        case 'verticalWall':
          return Math.abs(obstacle.x);
        case 'splitter':
          return Math.abs(obstacle.x) + obstacle.width / 2;
        case 'rotor':
          return Math.abs(obstacle.x) + obstacle.length / 2;
        case 'logoBar': {
          // Exact half-extent along X of a rotated box, so the tilt on the
          // wordmark can't quietly push a letter into a drain lane.
          const radians = (obstacle.angle * Math.PI) / 180;
          return (
            Math.abs(obstacle.x) +
            (obstacle.length / 2) * Math.abs(Math.cos(radians)) +
            (obstacle.thickness / 2) * Math.abs(Math.sin(radians))
          );
        }
        // Funnels and narrow passages deliberately span the full width; both
        // slope inward and drain through their opening instead.
        default:
          return null;
      }
    };

    for (let seed = 0; seed < 80; seed++) {
      for (const obstacle of allObstacles(build(seed))) {
        const reach = outerReach(obstacle);
        if (reach === null) continue;
        expect(
          reach,
          `${obstacle.kind} at x=${obstacle.x.toFixed(2)} (seed ${seed}) reaches the wall`,
        ).toBeLessThanOrEqual(half - gap + 1e-6);
      }
    }
  });

  it('gives every funnel a mouth that reaches past both side walls', () => {
    // A funnel narrower than the board leaves a pocket between its outer tip
    // and the wall, which holds any marble that lands in it until the timeout.
    const half = DEFAULT_TRACK_CONFIG.width / 2;

    for (let seed = 0; seed < 80; seed++) {
      for (const obstacle of allObstacles(build(seed))) {
        if (obstacle.kind !== 'funnel') continue;
        expect(obstacle.x - obstacle.mouth / 2).toBeLessThanOrEqual(-half);
        expect(obstacle.x + obstacle.mouth / 2).toBeGreaterThanOrEqual(half);
        // And the throat still has to pass marbles comfortably.
        expect(obstacle.throat).toBeGreaterThan(2);
      }
    }
  });

  it('keeps funnels shallower than the row spacing', () => {
    // A funnel hangs below its row line. Taller than the spacing and it would
    // reach the row beneath, pinching a marble-high slot between the two —
    // the shape that trapped seven marbles at once against a side wall.
    for (let seed = 0; seed < 60; seed++) {
      for (const obstacle of allObstacles(build(seed))) {
        if (obstacle.kind !== 'funnel') continue;
        expect(obstacle.height).toBeLessThan(DEFAULT_TRACK_CONFIG.rowSpacing);
      }
    }
  });

  it('always produces at least one obstacle per row', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const row of build(seed).rows) {
        expect(row.obstacles.length).toBeGreaterThan(0);
      }
    }
  });

  it('uses every obstacle kind across a spread of seeds', () => {
    // If a kind is unreachable, the PRD §7 requirement is only nominally met.
    const seen = new Set<string>();
    for (let seed = 0; seed < 120; seed++) {
      for (const obstacle of allObstacles(build(seed))) seen.add(obstacle.kind);
    }

    expect([...seen].sort()).toEqual([
      'bumper',
      'deflector',
      'funnel',
      'launcher',
      'logoBar',
      'meltBall',
      'narrowPassage',
      'rotor',
      'slantedWall',
      'splitter',
      'verticalWall',
    ]);
  });

  describe('bumper rows', () => {
    it('places eight pegs in every row', () => {
      for (let seed = 0; seed < 40; seed++) {
        for (const row of build(seed).rows) {
          const pegs = row.obstacles.filter((o) => o.kind === 'bumper');
          if (pegs.length === 0) continue;
          expect(pegs).toHaveLength(8);
        }
      }
    });

    it('still leaves a marble-sized gap between neighbouring pegs', () => {
      // Eight pegs is dense by design, but a row a marble cannot pass is a
      // wall, not a peg field — and unlike the melt balls these never vanish.
      const diameter = 0.84;
      for (let seed = 0; seed < 40; seed++) {
        for (const row of build(seed).rows) {
          const pegs = row.obstacles
            .filter((o) => o.kind === 'bumper')
            .sort((a, b) => a.x - b.x);

          for (let i = 1; i < pegs.length; i++) {
            const a = pegs[i - 1];
            const b = pegs[i];
            if (a.kind !== 'bumper' || b.kind !== 'bumper') continue;
            // Comfortably clear, not marginally: a gap barely wider than a
            // marble reads as a wall once the field is moving.
            expect((b.x - b.radius) - (a.x + a.radius)).toBeGreaterThan(diameter * 1.35);
          }
        }
      }
    });

    it('keeps the outermost pegs inside the drain lanes', () => {
      const limit = DEFAULT_TRACK_CONFIG.width / 2 - DEFAULT_TRACK_CONFIG.minDrainGap;
      for (let seed = 0; seed < 40; seed++) {
        for (const obstacle of allObstacles(build(seed))) {
          if (obstacle.kind !== 'bumper') continue;
          expect(Math.abs(obstacle.x) + obstacle.radius).toBeLessThanOrEqual(limit + 1e-6);
        }
      }
    });
  });

  describe('the ZPLAY wordmark', () => {
    const logoBars = (seed: number) =>
      allObstacles(build(seed)).filter((o) => o.kind === 'logoBar');

    it('draws the same five letters in every race', () => {
      // Z(3) + P(4) + L(2) + A(3) + Y(3) strokes, and identical whatever the
      // seed — it is branding, not track.
      const reference = logoBars(1);
      expect(reference).toHaveLength(15);
      for (const seed of [2, 99, 20260812]) {
        expect(logoBars(seed)).toEqual(reference);
      }
    });

    it('tilts every stroke clear of level', () => {
      // A level face on an inclined board holds a marble permanently: the
      // contact normal absorbs the whole down-board component of gravity. This
      // is Walls.ts's LEDGE_TILT rule, applied to the wordmark by rotating the
      // whole thing rather than by tilting strokes one at a time.
      const ledgeTilt = 12;
      for (const bar of logoBars(7)) {
        if (bar.kind !== 'logoBar') continue;
        // Fold to 0..90: a bar and the same bar turned 180 degrees are one shape.
        const fromLevel = Math.abs(90 - Math.abs(((bar.angle % 180) + 180) % 180 - 90));
        expect(fromLevel, `stroke at ${bar.angle.toFixed(1)} degrees is nearly level`)
          .toBeGreaterThanOrEqual(ledgeTilt);
      }
    });

    it('hangs entirely below the start gate and above the first obstacle row', () => {
      // Overlapping either end would put a marble-high slot between the
      // wordmark and its neighbour, which is the shape that traps whole groups.
      const config = DEFAULT_TRACK_CONFIG;
      const bars = logoBars(3);
      const extent = (bar: (typeof bars)[number]) => {
        if (bar.kind !== 'logoBar') return 0;
        const radians = (bar.angle * Math.PI) / 180;
        return (
          (bar.length / 2) * Math.abs(Math.sin(radians)) +
          (bar.thickness / 2) * Math.abs(Math.cos(radians))
        );
      };

      const top = Math.max(...bars.map((bar) => bar.y + extent(bar)));
      const bottom = Math.min(...bars.map((bar) => bar.y - extent(bar)));

      expect(top).toBeLessThan(config.firstRowY);
      // The first randomly generated row now sits two slots down.
      expect(bottom).toBeGreaterThan(config.firstRowY - 2 * config.rowSpacing);
    });

    it('is thick enough that a marble cannot tunnel through a letter', () => {
      for (const bar of logoBars(5)) {
        if (bar.kind !== 'logoBar') continue;
        expect(bar.thickness).toBeGreaterThanOrEqual(MIN_COLLIDER_THICKNESS);
      }
    });
  });

  describe('melt balls', () => {
    it('packs two rows tighter than a marble can pass', () => {
      // The whole point: an impassable barrier. Safe only because they melt.
      const diameter = 0.84;
      for (let seed = 0; seed < 20; seed++) {
        const rows = build(seed).rows.filter((row) =>
          row.obstacles.some((o) => o.kind === 'meltBall'),
        );
        // Two barriers, two rows each.
        expect(rows).toHaveLength(4);

        for (const row of rows) {
          const balls = [...row.obstacles].sort((a, b) => a.x - b.x);
          for (let i = 1; i < balls.length; i++) {
            const a = balls[i - 1];
            const b = balls[i];
            if (a.kind !== 'meltBall' || b.kind !== 'meltBall') continue;
            expect((b.x - b.radius) - (a.x + a.radius)).toBeLessThan(diameter);
          }
        }
      }
    });

    it('offsets each pair of rows so there is no straight path through', () => {
      const rows = build(3).rows.filter((row) =>
        row.obstacles.some((o) => o.kind === 'meltBall'),
      );
      const xs = rows.map((row) => row.obstacles.map((o) => o.x));
      // Every gap in the first row should have a ball near it in the second.
      for (let i = 1; i < xs[0].length; i++) {
        const gapCentre = (xs[0][i - 1] + xs[0][i]) / 2;
        const nearest = Math.min(...xs[1].map((x) => Math.abs(x - gapCentre)));
        expect(nearest).toBeLessThan(0.5);
      }
    });

    it('places both barriers in the body of the board, clear of both ends', () => {
      const { firstRowY, finishY } = DEFAULT_TRACK_CONFIG;
      const run = firstRowY - finishY;
      const balls = allObstacles(build(11)).filter((o) => o.kind === 'meltBall');
      expect(balls.length).toBeGreaterThan(20);

      for (const ball of balls) {
        const fraction = (firstRowY - ball.y) / run;
        expect(fraction).toBeGreaterThan(0.3);
        expect(fraction).toBeLessThan(0.75);
      }
    });

    it('gives every ball a positive melt time', () => {
      for (const ball of allObstacles(build(5))) {
        if (ball.kind !== 'meltBall') continue;
        expect(ball.meltSeconds).toBeGreaterThan(0);
      }
    });
  });

  describe('launchers', () => {
    it('scatters plenty of them down every track', () => {
      // These are what make a run reversible rather than a one-way descent, so
      // a sparse track would quietly lose the whole effect.
      for (let seed = 0; seed < 30; seed++) {
        const launchers = allObstacles(build(seed)).filter((o) => o.kind === 'launcher');
        expect(launchers.length).toBeGreaterThanOrEqual(16);
      }
    });

    it('puts launchers in both side lanes', () => {
      const lane = DEFAULT_TRACK_CONFIG.width / 2 - DEFAULT_TRACK_CONFIG.minDrainGap;
      for (let seed = 0; seed < 30; seed++) {
        const edge = allObstacles(build(seed)).filter(
          (o) => o.kind === 'launcher' && Math.abs(o.x) > lane,
        );
        expect(edge.some((o) => o.x < 0)).toBe(true);
        expect(edge.some((o) => o.x > 0)).toBe(true);
      }
    });

    it('always leaves a marble-sized gap between pads in a row', () => {
      // Pads packed edge to edge form an unbroken kicker wall: marbles are
      // thrown up faster than they fall through and the field never descends.
      // `width` is a half-extent, which is exactly how that happened.
      for (let seed = 0; seed < 60; seed++) {
        for (const row of build(seed).rows) {
          const pads = row.obstacles
            .filter((o) => o.kind === 'launcher')
            .sort((a, b) => a.x - b.x);

          for (let i = 1; i < pads.length; i++) {
            const gap = (pads[i].x - pads[i].width) - (pads[i - 1].x + pads[i - 1].width);
            expect(gap, `seed ${seed}: pads ${i - 1}/${i} only ${gap.toFixed(2)} apart`)
              .toBeGreaterThan(1.2);
          }
        }
      }
    });

    it('always kicks up the board, never down', () => {
      // A negative strength would fire marbles at the finish line and turn a
      // reversal mechanic into a shortcut.
      for (let seed = 0; seed < 40; seed++) {
        for (const obstacle of allObstacles(build(seed))) {
          if (obstacle.kind !== 'launcher') continue;
          expect(obstacle.strength).toBeGreaterThan(0);
          expect(Math.abs(obstacle.lateral)).toBeLessThanOrEqual(1);
        }
      }
    });

    it('spreads launchers along the whole board, not just one stretch', () => {
      const launchers = allObstacles(build(9)).filter((o) => o.kind === 'launcher');
      const ys = launchers.map((o) => o.y);
      const span = Math.max(...ys) - Math.min(...ys);
      const boardRun = DEFAULT_TRACK_CONFIG.firstRowY - DEFAULT_TRACK_CONFIG.finishY;
      expect(span).toBeGreaterThan(boardRun * 0.7);
    });
  });
});
