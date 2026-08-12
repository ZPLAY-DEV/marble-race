/**
 * Race result types and serialisation (PRD §9).
 *
 * The result carries everything a server would need to re-simulate and verify
 * the outcome: the seed, the player count, and the engine build that produced
 * it. Ammo is deterministic for a fixed timestep on a given build, so
 * verification requires matching `engineVersion` — recording it is what makes
 * a future authoritative check possible rather than merely plausible.
 */

export type MarbleId = string;

export interface Participant {
  id: MarbleId;
  /** 1-based player number, used for labels. */
  number: number;
  name: string;
  /** Hex colour, e.g. `#ff3d81`. */
  color: string;
}

export interface FinishRecord {
  id: MarbleId;
  /** 1-based finishing position. DNF marbles keep ranking after finishers. */
  rank: number;
  /** Race time in seconds, or null if the marble never finished. */
  time: number | null;
  /** True when the marble was ranked by the timeout rule instead of finishing. */
  dnf: boolean;
}

export interface RaceResult {
  seed: number;
  startedAt: number;
  /** Simulated race duration in seconds. */
  duration: number;
  playerCount: number;
  engineVersion: string;
  /** Marble ids in finishing order, fastest first. */
  finishOrder: MarbleId[];
  records: FinishRecord[];
}

/** Build tag recorded with every result so replays can be matched to a build. */
export const ENGINE_VERSION = 'marble-race/1.0.0+playcanvas2.21.3';

/** Encodes a race setup as URL search params, for seed sharing (PRD §31). */
export function toShareParams(seed: number, playerCount: number): string {
  const params = new URLSearchParams();
  params.set('seed', String(seed >>> 0));
  params.set('players', String(playerCount));
  return params.toString();
}

export interface ParsedRaceParams {
  seed?: number;
  players?: number;
  selftest: boolean;
}

/** Reads `?seed=&players=&selftest` from a query string. Invalid values are ignored. */
export function parseRaceParams(search: string): ParsedRaceParams {
  const params = new URLSearchParams(search);
  const result: ParsedRaceParams = { selftest: params.has('selftest') };

  const seed = Number.parseInt(params.get('seed') ?? '', 10);
  if (Number.isFinite(seed) && seed >= 0) result.seed = seed >>> 0;

  const players = Number.parseInt(params.get('players') ?? '', 10);
  if (Number.isFinite(players) && players > 0) result.players = players;

  return result;
}
