import { describe, expect, it } from 'vitest';
import { clampPlayerCount, DEFAULT_GAME_CONFIG } from '../src/core/GameConfig';
import { createRoster, marbleId, namesForCount, playerName } from '../src/marble/MarbleConfig';
import { parseRaceParams, toShareParams } from '../src/race/RaceResult';
import { formatDuration } from '../src/util/math';

describe('race params', () => {
  it('round-trips a seed and player count', () => {
    const params = parseRaceParams(`?${toShareParams(4294967295, 42)}`);
    expect(params.seed).toBe(4294967295);
    expect(params.players).toBe(42);
  });

  it('ignores malformed values rather than throwing', () => {
    const params = parseRaceParams('?seed=abc&players=-3');
    expect(params.seed).toBeUndefined();
    expect(params.players).toBeUndefined();
  });

  it('detects the selftest flag', () => {
    expect(parseRaceParams('?selftest').selftest).toBe(true);
    expect(parseRaceParams('').selftest).toBe(false);
  });
});

describe('clampPlayerCount', () => {
  it('holds the count inside the configured bounds', () => {
    expect(clampPlayerCount(1, DEFAULT_GAME_CONFIG)).toBe(DEFAULT_GAME_CONFIG.minPlayers);
    expect(clampPlayerCount(5000, DEFAULT_GAME_CONFIG)).toBe(DEFAULT_GAME_CONFIG.playerLimit);
    expect(clampPlayerCount(25, DEFAULT_GAME_CONFIG)).toBe(25);
  });

  it('falls back to the default when given nonsense', () => {
    expect(clampPlayerCount(Number.NaN, DEFAULT_GAME_CONFIG)).toBe(
      DEFAULT_GAME_CONFIG.maxPlayers,
    );
  });
});

describe('roster', () => {
  it('pads ids and names to two digits (PRD §5, §15)', () => {
    expect(marbleId(0)).toBe('marble-01');
    expect(marbleId(9)).toBe('marble-10');
    expect(playerName(3)).toBe('PLAYER 04');
  });

  it('gives every marble a unique id', () => {
    const roster = createRoster(namesForCount(100));
    expect(new Set(roster.map((p) => p.id)).size).toBe(100);
  });

  it('is a pure function of the player count', () => {
    expect(createRoster(namesForCount(10))).toEqual(createRoster(namesForCount(10)));
  });

  it('assigns distinct colours across a default field', () => {
    const roster = createRoster(namesForCount(10));
    expect(new Set(roster.map((p) => p.color)).size).toBe(10);
  });
});

describe('formatDuration', () => {
  it('formats as M:SS.mmm', () => {
    expect(formatDuration(0)).toBe('0:00.000');
    expect(formatDuration(9.5)).toBe('0:09.500');
    expect(formatDuration(65.25)).toBe('1:05.250');
  });

  it('clamps negatives to zero', () => {
    expect(formatDuration(-3)).toBe('0:00.000');
  });
});
