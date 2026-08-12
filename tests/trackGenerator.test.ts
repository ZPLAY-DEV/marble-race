import { describe, expect, it } from 'vitest';
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

  it('opens with bumper fields so the starting grid is broken up', () => {
    // Edge-launcher rows interleave with the main sequence, so pick out the
    // main rows: the assertion is about what the field meets first, not about
    // list positions.
    const mainRows = build(404).rows.filter((row) =>
      row.obstacles.some((o) => o.kind !== 'launcher'),
    );

    expect(mainRows[0].obstacles.every((o) => o.kind === 'bumper')).toBe(true);
    expect(mainRows[1].obstacles.every((o) => o.kind === 'bumper')).toBe(true);
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
      'meltBall',
      'narrowPassage',
      'rotor',
      'slantedWall',
      'splitter',
      'verticalWall',
    ]);
  });

  describe('melt balls', () => {
    it('packs two rows tighter than a marble can pass', () => {
      // The whole point: an impassable barrier. Safe only because they melt.
      const diameter = 0.84;
      for (let seed = 0; seed < 20; seed++) {
        const rows = build(seed).rows.filter((row) =>
          row.obstacles.some((o) => o.kind === 'meltBall'),
        );
        expect(rows).toHaveLength(2);

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

    it('offsets the two rows so there is no straight path through', () => {
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

    it('sits in the middle of the board, well clear of both ends', () => {
      const { firstRowY, finishY } = DEFAULT_TRACK_CONFIG;
      const balls = allObstacles(build(11)).filter((o) => o.kind === 'meltBall');
      const midY = (firstRowY + finishY) / 2;
      for (const ball of balls) {
        expect(Math.abs(ball.y - midY)).toBeLessThan(6);
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
