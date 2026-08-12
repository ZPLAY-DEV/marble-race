import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME_CONFIG, type GameConfig } from '../src/core/GameConfig';
import { GameState } from '../src/core/GameState';
import { createRoster, namesForCount } from '../src/marble/MarbleConfig';
import { FIXED_TIMESTEP } from '../src/physics/PhysicsConfig';
import { RaceManager, type ProgressSource } from '../src/race/RaceManager';

const CONFIG: GameConfig = {
  ...DEFAULT_GAME_CONFIG,
  readyHoldSeconds: 0.5,
  countdownSeconds: 3,
  raceTimeoutSeconds: 10,
  resultDelaySeconds: 0.5,
};

/** Stands in for MarbleManager: RaceManager only needs the ordering. */
class FakeProgress implements ProgressSource {
  constructor(public order: string[] = []) {}
  rankUnfinishedByProgress(): string[] {
    return this.order;
  }
}

function advance(race: RaceManager, seconds: number): void {
  const steps = Math.round(seconds / FIXED_TIMESTEP);
  for (let i = 0; i < steps; i++) race.tick(FIXED_TIMESTEP);
}

describe('RaceManager', () => {
  let progress: FakeProgress;
  let race: RaceManager;

  beforeEach(() => {
    progress = new FakeProgress();
    race = new RaceManager(CONFIG, progress);
    race.prepare(createRoster(namesForCount(3)), 1234, true);
  });

  it('holds at READY until armed, so the start screen never runs itself', () => {
    // Also what lets audio work: browsers only permit sound after a real user
    // gesture, so an auto-started first race would always be silent.
    const held = new RaceManager(CONFIG, progress);
    held.prepare(createRoster(namesForCount(3)), 1234);
    advance(held, 30);
    expect(held.state).toBe(GameState.READY);

    held.arm();
    advance(held, 0.6);
    expect(held.state).toBe(GameState.COUNTDOWN);
  });

  it('arms into READY', () => {
    expect(race.state).toBe(GameState.READY);
    expect(race.currentSeed).toBe(1234);
    expect(race.roster).toHaveLength(3);
  });

  it('runs READY → COUNTDOWN → RACING on its own', () => {
    advance(race, 0.6);
    expect(race.state).toBe(GameState.COUNTDOWN);

    advance(race, 3.1);
    expect(race.state).toBe(GameState.RACING);
  });

  it('emits each countdown beat exactly once', () => {
    const beats: number[] = [];
    race.events.on('countdown', ({ value }) => beats.push(value));

    advance(race, 4);

    // 3, 2, 1, then 0 meaning GO — no repeats however many steps land per beat.
    expect(beats).toEqual([3, 2, 1, 0]);
  });

  it('ignores finishes reported outside RACING', () => {
    expect(race.reportFinish('marble-01')).toBeNull();
    advance(race, 4);
    expect(race.reportFinish('marble-01')).not.toBeNull();
  });

  it('ignores finishes from unknown marbles', () => {
    advance(race, 4);
    expect(race.reportFinish('marble-99')).toBeNull();
  });

  it('records a marble once even if the trigger repeats', () => {
    const finished = vi.fn();
    race.events.on('marbleFinished', finished);
    advance(race, 4);

    race.reportFinish('marble-01');
    race.reportFinish('marble-01');

    expect(finished).toHaveBeenCalledTimes(1);
  });

  it('completes once every marble is home', () => {
    const complete = vi.fn();
    race.events.on('raceComplete', complete);
    advance(race, 4);

    race.reportFinish('marble-02');
    race.reportFinish('marble-01');
    race.reportFinish('marble-03');
    advance(race, FIXED_TIMESTEP);

    expect(complete).toHaveBeenCalledTimes(1);
    expect(race.state).toBe(GameState.FINISHED);
    expect(race.lastResult?.finishOrder).toEqual(['marble-02', 'marble-01', 'marble-03']);
  });

  it('advances to RESULT after the delay', () => {
    advance(race, 4);
    race.reportFinish('marble-01');
    race.reportFinish('marble-02');
    race.reportFinish('marble-03');
    advance(race, 0.6);

    expect(race.state).toBe(GameState.RESULT);
  });

  it('closes out a stalled race at the timeout, ranked by progress', () => {
    // PRD §26: a race where marbles never finish must still terminate.
    progress.order = ['marble-03', 'marble-02'];
    advance(race, 4);
    race.reportFinish('marble-01');

    advance(race, CONFIG.raceTimeoutSeconds + 0.1);

    const result = race.lastResult;
    expect(result).not.toBeNull();
    expect(result?.finishOrder).toEqual(['marble-01', 'marble-03', 'marble-02']);
    expect(result?.records[0].dnf).toBe(false);
    expect(result?.records[1].dnf).toBe(true);
    expect(result?.records[2].dnf).toBe(true);
  });

  it('carries the seed and engine version into the result', () => {
    advance(race, 4);
    race.reportFinish('marble-01');
    race.reportFinish('marble-02');
    race.reportFinish('marble-03');
    advance(race, FIXED_TIMESTEP);

    expect(race.lastResult?.seed).toBe(1234);
    expect(race.lastResult?.playerCount).toBe(3);
    expect(race.lastResult?.engineVersion).toMatch(/marble-race/);
  });

  it('times the race in simulated, not wall-clock, seconds', () => {
    advance(race, 4);
    advance(race, 2);
    race.reportFinish('marble-01');

    // READY+COUNTDOWN eats 3.5s of the 6s ticked, leaving ~2.5s of racing —
    // and that figure holds regardless of how fast the test machine ran.
    expect(race.ranking.records[0].time).toBeCloseTo(2.5, 1);
  });

  it('can be re-prepared for another race', () => {
    advance(race, 4);
    race.reportFinish('marble-01');
    race.reset();
    race.prepare(createRoster(namesForCount(2)), 777);

    expect(race.state).toBe(GameState.READY);
    expect(race.currentSeed).toBe(777);
    expect(race.ranking.finishedCount).toBe(0);
    expect(race.lastResult).toBeNull();
  });
});
