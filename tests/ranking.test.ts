import { describe, expect, it } from 'vitest';
import { RankingManager } from '../src/race/RankingManager';

describe('RankingManager', () => {
  it('assigns ranks in arrival order', () => {
    const ranking = new RankingManager();
    ranking.recordFinish('marble-03', 5.1);
    ranking.recordFinish('marble-01', 5.4);
    ranking.recordFinish('marble-02', 6.0);

    expect(ranking.records.map((record) => record.id)).toEqual([
      'marble-03',
      'marble-01',
      'marble-02',
    ]);
    expect(ranking.records.map((record) => record.rank)).toEqual([1, 2, 3]);
  });

  it('records a marble exactly once however often the trigger fires', () => {
    // A physics trigger fires on every overlap as a marble rolls through the
    // finish volume. This guard is the whole reason the class exists.
    const ranking = new RankingManager();
    expect(ranking.recordFinish('marble-01', 4.0)).not.toBeNull();
    expect(ranking.recordFinish('marble-01', 4.2)).toBeNull();
    expect(ranking.recordFinish('marble-01', 9.9)).toBeNull();

    expect(ranking.finishedCount).toBe(1);
    expect(ranking.records[0].time).toBe(4.0);
  });

  it('does not let a duplicate consume a rank', () => {
    const ranking = new RankingManager();
    ranking.recordFinish('a', 1);
    ranking.recordFinish('a', 1.1);
    ranking.recordFinish('b', 2);

    expect(ranking.records.map((record) => record.rank)).toEqual([1, 2]);
    expect(ranking.records[1].id).toBe('b');
  });

  it('reports the rank the next finisher would take', () => {
    const ranking = new RankingManager();
    expect(ranking.nextRank).toBe(1);
    ranking.recordFinish('a', 1);
    expect(ranking.nextRank).toBe(2);
  });

  it('appends unfinished marbles as DNF in the order given', () => {
    const ranking = new RankingManager();
    ranking.recordFinish('a', 1);

    const records = ranking.finalise(['c', 'b']);

    expect(records.map((record) => record.id)).toEqual(['a', 'c', 'b']);
    expect(records.map((record) => record.rank)).toEqual([1, 2, 3]);
    expect(records[1]).toMatchObject({ dnf: true, time: null });
    expect(records[0]).toMatchObject({ dnf: false, time: 1 });
  });

  it('ignores already-finished marbles passed to finalise', () => {
    const ranking = new RankingManager();
    ranking.recordFinish('a', 1);
    const records = ranking.finalise(['a', 'b']);

    expect(records).toHaveLength(2);
    expect(records.filter((record) => record.id === 'a')).toHaveLength(1);
  });

  it('clears completely on reset', () => {
    const ranking = new RankingManager();
    ranking.recordFinish('a', 1);
    ranking.reset();

    expect(ranking.finishedCount).toBe(0);
    expect(ranking.hasFinished('a')).toBe(false);
    expect(ranking.recordFinish('a', 2)).not.toBeNull();
  });
});
