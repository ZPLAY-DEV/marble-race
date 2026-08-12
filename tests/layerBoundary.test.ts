import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Enforces the PRD §3.2 separation between game rules and physics/rendering.
 *
 * A comment saying "this layer is pure" decays the moment someone adds an
 * import. This test is what actually keeps the boundary standing, and it is
 * why a server-side or headless mode stays possible.
 */
const SOURCE = resolve(__dirname, '../src');

/** Directories and files that must never depend on the rendering engine. */
const PURE_PATHS = [
  'random',
  'race',
  'util',
  'core/GameState.ts',
  'core/GameConfig.ts',
  'track/TrackGenerator.ts',
  'track/TrackLayout.ts',
  'track/TrackConfig.ts',
  'marble/MarbleConfig.ts',
  'physics/PhysicsConfig.ts',
  'visual/Palette.ts',
];

function collectFiles(path: string): string[] {
  const full = join(SOURCE, path);
  if (statSync(full).isFile()) return [full];

  return readdirSync(full).flatMap((entry) => {
    const child = join(full, entry);
    if (statSync(child).isDirectory()) return collectFiles(join(path, entry));
    return child.endsWith('.ts') ? [child] : [];
  });
}

describe('layer boundaries', () => {
  const files = PURE_PATHS.flatMap(collectFiles);

  it('covers every file it claims to', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((file) => relative(SOURCE, file)))(
    '%s does not import playcanvas',
    (relativePath) => {
      const source = readFileSync(join(SOURCE, relativePath), 'utf8');
      expect(source).not.toMatch(/from\s+['"]playcanvas['"]/);
      expect(source).not.toMatch(/require\(['"]playcanvas['"]\)/);
    },
  );

  it.each(files.map((file) => relative(SOURCE, file)))(
    '%s does not use Math.random',
    (relativePath) => {
      // PRD §24: all gameplay randomness must flow through RandomManager, which
      // is allowed exactly one fallback use for generating a fresh seed.
      const source = readFileSync(join(SOURCE, relativePath), 'utf8');
      const uses = source.match(/Math\.random\(\)/g) ?? [];
      const allowed = relativePath === join('random', 'RandomManager.ts') ? 1 : 0;
      expect(uses.length).toBe(allowed);
    },
  );
});
