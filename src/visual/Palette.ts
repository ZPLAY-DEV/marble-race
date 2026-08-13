/**
 * Neon-arcade palette (PRD §20). Pure data — no PlayCanvas types here, so the
 * same values feed both the 3D materials and the HTML/CSS overlay.
 *
 * Marble hues are spaced around the wheel and kept at high saturation so ten
 * of them stay distinguishable against a dark board, which is the actual
 * requirement in PRD §16.
 */

/** Base marble colours, cycled when there are more players than entries. */
export const MARBLE_COLORS: readonly string[] = [
  '#ff2e63',
  '#00e5ff',
  '#8cff3d',
  '#ffd23f',
  '#b06bff',
  '#ff7a29',
  '#22ffa7',
  '#ff5edb',
  '#4d7cff',
  '#f4f7ff',
  '#ff9bb5',
  '#00c2a8',
  '#c9ff4d',
  '#ffb347',
  '#7ad3ff',
  '#e05cff',
  '#5cffd6',
  '#ff4d4d',
  '#9fff8c',
  '#c0a3ff',
];

export const SCENE_COLORS = {
  /** Cleared framebuffer colour, behind the gradient backdrop. */
  background: '#070912',
  /** Board face. */
  board: '#171d38',
  /** Board edge trim, emissive. */
  boardTrim: '#2b3a7a',
  /** Side walls. */
  wall: '#242c52',
  bumper: '#ff2e88',
  bumperEmissive: '#ff2e88',
  slantedWall: '#3d5bd9',
  verticalWall: '#3d5bd9',
  narrowPassage: '#00d2ff',
  splitter: '#ffd23f',
  funnel: '#22ffa7',
  rotor: '#b06bff',
  deflector: '#ff7a29',
  // Electric lime, used by nothing else: launchers are the most consequential
  // thing on the board, so they must be identifiable at a glance.
  launcher: '#a6ff00',
  meltBall: '#f2f6ff',
  // The ZPLAY wordmark under the start gate. Deliberately the gate's own sky
  // blue rather than a colour of its own, so the top of the board reads as one
  // piece of branding instead of as another obstacle type to learn.
  logo: '#e8f4ff',
  logoEmissive: '#00d2ff',
  finishLine: '#ffffff',
  finishGlow: '#22ffa7',
} as const;

export const LIGHT_COLORS = {
  key: '#ffffff',
  fill: '#4f6bff',
  rim: '#ff5ea8',
  ambient: '#161d3d',
} as const;

/** Converts `#rrggbb` to linear-ish 0..1 RGB triples for PlayCanvas materials. */
export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const value = Number.parseInt(clean, 16);
  if (!Number.isFinite(value) || clean.length !== 6) {
    throw new Error(`Invalid hex colour: ${hex}`);
  }
  return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255];
}

/**
 * How hot a pop bumper can get. Each hit advances one step, and each step
 * doubles the kick, so the top step is 2^(steps-1) times the base.
 */
export const BUMPER_HEAT_STEPS = 5;

/**
 * Bumper colour by heat level, cool (0) to fully charged (4).
 *
 * Deliberately a discrete ladder rather than an interpolation: the whole point
 * is that a player can count how charged a bumper is at a glance, and five
 * distinct colours read far better in motion than a continuous gradient.
 */
const BUMPER_HEAT: readonly string[] = [
  '#ff2e88', // cool — the resting pink
  '#ff2f6a',
  '#ff3347',
  '#ff2a20',
  '#ff0000', // fully charged
];

export function bumperHeatColor(level: number): string {
  const index = Math.max(0, Math.min(BUMPER_HEAT.length - 1, Math.floor(level)));
  return BUMPER_HEAT[index];
}

/** Emissive strength for a heat level, so a charged bumper visibly glows hotter. */
export function bumperHeatEmissive(level: number): number {
  const index = Math.max(0, Math.min(BUMPER_HEAT_STEPS - 1, Math.floor(level)));
  return 0.55 + index * 0.4;
}

/** Colour for player index `index` (0-based), cycling if the roster is large. */
export function marbleColor(index: number): string {
  return MARBLE_COLORS[index % MARBLE_COLORS.length];
}
