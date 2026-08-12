import { describe, expect, it } from 'vitest';
import { RandomManager, STREAM } from '../src/random/RandomManager';

describe('RandomManager', () => {
  it('reproduces the same sequence for the same seed', () => {
    const draw = (seed: number) => {
      const manager = new RandomManager(seed);
      const stream = manager.stream(STREAM.track);
      return Array.from({ length: 40 }, () => stream.float());
    };

    expect(draw(12345)).toEqual(draw(12345));
  });

  it('produces different sequences for different seeds', () => {
    const first = new RandomManager(1).stream(STREAM.track).float();
    const second = new RandomManager(2).stream(STREAM.track).float();
    expect(first).not.toBe(second);
  });

  it('keeps named streams independent', () => {
    // The point of named streams: consuming extra draws from one must not
    // change what another produces, so a code change can't invalidate seeds.
    const manager = new RandomManager(999);
    const track = manager.stream(STREAM.track);
    for (let i = 0; i < 25; i++) track.float();
    const deflectorAfter = manager.stream(STREAM.deflector).float();

    const control = new RandomManager(999);
    const deflectorBefore = control.stream(STREAM.deflector).float();

    expect(deflectorAfter).toBe(deflectorBefore);
  });

  it('returns the same stream instance for a repeated name', () => {
    const manager = new RandomManager(7);
    const a = manager.stream('x');
    const b = manager.stream('x');
    expect(a).toBe(b);
    // Continuing, not restarting: two draws from the "same" stream must differ.
    expect(a.float()).not.toBe(b.float());
  });

  it('resets streams when the seed changes', () => {
    const manager = new RandomManager(5);
    const first = manager.stream('a').float();
    manager.setSeed(5);
    expect(manager.stream('a').float()).toBe(first);
  });

  describe('helpers', () => {
    it('keeps range() within bounds', () => {
      const stream = new RandomManager(42).stream('r');
      for (let i = 0; i < 500; i++) {
        const value = stream.range(-3, 7);
        expect(value).toBeGreaterThanOrEqual(-3);
        expect(value).toBeLessThan(7);
      }
    });

    it('keeps int() inclusive on both ends', () => {
      const stream = new RandomManager(8).stream('i');
      const seen = new Set<number>();
      for (let i = 0; i < 500; i++) seen.add(stream.int(1, 3));
      expect([...seen].sort()).toEqual([1, 2, 3]);
    });

    it('never picks a zero-weight entry', () => {
      const stream = new RandomManager(11).stream('w');
      const items = ['keep', 'skip'];
      for (let i = 0; i < 200; i++) {
        expect(stream.weighted(items, (item) => (item === 'skip' ? 0 : 1))).toBe('keep');
      }
    });

    it('throws rather than returning undefined on an empty pick', () => {
      const stream = new RandomManager(1).stream('e');
      expect(() => stream.pick([])).toThrow();
    });

    it('shuffles reproducibly', () => {
      const shuffled = (seed: number) =>
        new RandomManager(seed).stream('s').shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(shuffled(3)).toEqual(shuffled(3));
    });
  });
});
