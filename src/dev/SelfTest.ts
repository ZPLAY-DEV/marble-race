import type { Game } from '../core/Game';
import type { RaceResult } from '../race/RaceResult';

/**
 * In-browser determinism check, enabled with `?selftest`.
 *
 * PRD §26 asks whether the same seed reproduces the same result. Ammo's
 * determinism claim only holds for a fixed timestep on a given build, so the
 * honest way to state it is to *measure* it rather than assert it in a comment.
 *
 * This runs the same seed twice, back to back, and reports whether the finish
 * orders match. It deliberately exercises the real physics path — a pure-logic
 * test could never catch a divergence in the solver.
 */
export function runSelfTest(game: Game): void {
  const race = game.raceManager;
  const seed = race.currentSeed;
  const lineup = race.roster.map((participant) => participant.name);

  let firstRun: RaceResult | null = null;

  const unsubscribe = race.events.on('raceComplete', ({ result }) => {
    if (!firstRun) {
      firstRun = result;
      console.info('[selftest] run 1 complete', result.finishOrder.join(' > '));
      // Re-run the identical seed once the current race has settled.
      window.setTimeout(() => game.startRace(lineup, seed), 500);
      return;
    }

    const first = firstRun.finishOrder.join(',');
    const second = result.finishOrder.join(',');
    const identical = first === second;

    console.info('[selftest] run 2 complete', result.finishOrder.join(' > '));
    if (identical) {
      console.info(`%c[selftest] PASS — seed ${seed} reproduced exactly`, 'color:#22ffa7');
    } else {
      console.warn('[selftest] FAIL — finish orders diverged');
      console.warn('  run 1:', first);
      console.warn('  run 2:', second);
    }

    unsubscribe();
  });

  game.startRace(lineup, seed);
}
