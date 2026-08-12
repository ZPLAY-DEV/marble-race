/**
 * Seeded randomness (PRD §8). Pure — no PlayCanvas, no DOM, no Math.random.
 *
 * Randomness is split into *named streams*. Each stream is an independent
 * generator derived from the master seed by hashing its name, so adding an
 * extra draw during track generation cannot shift what the deflectors do.
 * Without this, every code change would silently invalidate every shared seed.
 */

/** 32-bit string hash (FNV-1a). Stable across runs and platforms. */
function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 — small, fast, and good enough for gameplay randomness. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One independent, reproducible source of randomness. */
export class RandomStream {
  private readonly next: () => number;
  private drawCount = 0;

  constructor(seed: number) {
    this.next = mulberry32(seed);
  }

  /** Uniform float in [0, 1). */
  float(): number {
    this.drawCount++;
    return this.next();
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.float() * (max - min);
  }

  /** Uniform float in [-magnitude, +magnitude). */
  spread(magnitude: number): number {
    return this.range(-magnitude, magnitude);
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  /** True with the given probability. */
  chance(probability: number): boolean {
    return this.float() < probability;
  }

  /** Uniformly picks one element. Throws on an empty list rather than returning undefined. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('RandomStream.pick: empty list');
    return items[this.int(0, items.length - 1)];
  }

  /**
   * Picks one entry using relative weights. Entries with weight <= 0 are
   * unreachable. Throws if nothing is selectable.
   */
  weighted<T>(items: readonly T[], weightOf: (item: T) => number): T {
    let total = 0;
    for (const item of items) total += Math.max(0, weightOf(item));
    if (total <= 0) throw new Error('RandomStream.weighted: no positive weights');

    let roll = this.float() * total;
    for (const item of items) {
      roll -= Math.max(0, weightOf(item));
      if (roll < 0) return item;
    }
    return items[items.length - 1];
  }

  /** Fisher-Yates, in place. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  /** How many raw draws have been taken. Useful for debugging divergence. */
  get draws(): number {
    return this.drawCount;
  }
}

/**
 * Owns the master seed and hands out named streams.
 *
 * Streams are memoised per name, so repeated `stream('deflector')` calls during
 * a race continue the same sequence rather than restarting it.
 */
export class RandomManager {
  private seed = 0;
  private streams = new Map<string, RandomStream>();

  constructor(seed?: number) {
    this.setSeed(seed ?? RandomManager.randomSeed());
  }

  /** Resets the master seed and discards all existing streams. */
  setSeed(seed: number): void {
    this.seed = seed >>> 0;
    this.streams.clear();
  }

  getSeed(): number {
    return this.seed;
  }

  /** Returns the named stream, creating it on first use. */
  stream(name: string): RandomStream {
    let stream = this.streams.get(name);
    if (!stream) {
      // Mixing the name hash with the seed keeps streams independent while
      // still making the whole set a deterministic function of the seed.
      stream = new RandomStream((this.seed ^ hashString(name)) >>> 0);
      this.streams.set(name, stream);
    }
    return stream;
  }

  /**
   * A fresh unpredictable seed. This is the *only* place non-deterministic
   * randomness enters the game, and it happens once, before the race starts.
   */
  static randomSeed(): number {
    const globalCrypto = (globalThis as { crypto?: Crypto }).crypto;
    if (globalCrypto?.getRandomValues) {
      return globalCrypto.getRandomValues(new Uint32Array(1))[0];
    }
    return Math.floor(Math.random() * 0xffffffff) >>> 0;
  }
}

/** Stream names used across the game, collected so they can't drift apart. */
export const STREAM = {
  track: 'track',
  marbles: 'marbles',
  deflector: 'deflector',
  rotor: 'rotor',
  rescue: 'rescue',
} as const;
