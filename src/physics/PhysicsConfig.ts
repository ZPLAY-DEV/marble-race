/**
 * Physics tuning. PRD §17: these are chosen for *fun*, not realism.
 * Gravity is stronger than earth so the race reads as energetic, and
 * restitution is high enough that bumpers feel arcade-y.
 */
export interface PhysicsConfig {
  gravity: number;
  marbleMass: number;
  marbleRadius: number;
  friction: number;
  restitution: number;
  linearDamping: number;
  angularDamping: number;
  /** Speed cap (units/s) so marbles never tunnel through thin walls. */
  maxSpeed: number;
}

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  gravity: -24,
  marbleMass: 1,
  marbleRadius: 0.42,
  friction: 0.22,
  restitution: 0.42,
  linearDamping: 0.02,
  angularDamping: 0.06,
  // Raised to accommodate the launchers: bounce height goes with the square of
  // velocity, so a four-times-higher launch needs twice the speed. That in turn
  // forced MIN_COLLIDER_THICKNESS up — see the invariant below.
  maxSpeed: 48,
};

/**
 * Fixed physics step (PRD §18). The simulation only ever advances in exact
 * multiples of this, regardless of display refresh rate, so a given seed
 * produces the same finish order at 30/60/120/144 Hz.
 */
export const FIXED_TIMESTEP = 1 / 120;

/** Ceiling on catch-up steps per frame, to avoid a spiral of death after a stall. */
export const MAX_STEPS_PER_FRAME = 8;

/** Real-time seconds that may be accumulated in one frame before we drop time. */
export const MAX_FRAME_DELTA = MAX_STEPS_PER_FRAME * FIXED_TIMESTEP;

/**
 * Thinnest collider a marble can meet: the obstacle wall boxes.
 *
 * Tunnelling is prevented by geometry rather than by continuous collision
 * detection (which PlayCanvas 2.21 does not expose): as long as
 * `maxSpeed * FIXED_TIMESTEP` stays below this, a marble can never cross a
 * collider within a single step. Change either value and the invariant test
 * will tell you.
 */
export const MIN_COLLIDER_THICKNESS = 0.6;

/**
 * Base outward kick from a cold pop bumper, in units/s on a 1kg marble.
 *
 * Each heat step doubles it, so the ladder runs 3 → 6 → 12 → 24 → 48 across the
 * five steps. The top of that ladder is deliberately `maxSpeed`: a fully
 * charged bumper hits the hardest the simulation permits, and no harder — a
 * bigger number would simply be clipped by the speed clamp and the last step
 * would feel identical to the one before it.
 */
export const BUMPER_BASE_KICK = 3;

/** Kick from a bumper at `level`, doubling per step. */
export function bumperKick(level: number): number {
  return BUMPER_BASE_KICK * Math.pow(2, Math.max(0, level));
}

/** Surface material properties for track pieces, by role. */
export const SURFACE = {
  board: { friction: 0.3, restitution: 0.15 },
  wall: { friction: 0.15, restitution: 0.35 },
  bumper: { friction: 0.05, restitution: 1.15 },
  rotor: { friction: 0.2, restitution: 0.5 },
  splitter: { friction: 0.1, restitution: 0.6 },
  meltBall: { friction: 0.08, restitution: 0.55 },
} as const;
