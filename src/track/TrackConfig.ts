/**
 * Board geometry. The board is an inclined slab (a pachinko / 뽑기 machine),
 * not a flat vertical plane — the tilt is what gives the scene real depth.
 *
 * Board-local space:
 *   +X  across the board (right)
 *   +Y  up the board, toward the start
 *   +Z  out of the board face, toward the camera
 * Marbles travel toward -Y.
 */
export interface TrackConfig {
  /** Angle of the board face from vertical, in degrees. 0 = vertical wall. */
  tiltDegrees: number;
  /**
   * Playable width in board-local X.
   *
   * Wide enough that the whole default roster fits on a single start row.
   * A narrower board stacks the overflow into a second row above the first,
   * and those marbles are released a beat late through the gap the front row
   * leaves — they read as "not falling" while everyone else is away.
   * `tests/physicsInvariants.test.ts` holds the relationship.
   */
  width: number;
  /**
   * Gap between the board face and the invisible front glass.
   *
   * Must be shallower than two marble diameters. At 1.9 it was not, and two
   * marbles could stack front-to-back in the cavity and wedge each other
   * against an obstacle — a jam neither could escape, which survived 58 rescue
   * impulses and ran a race to the timeout. Keeping the channel single-file
   * makes that geometrically impossible.
   */
  depth: number;
  /** Thickness of the back slab and side walls. */
  wallThickness: number;
  /** Spacing between generated obstacle rows along -Y. */
  rowSpacing: number;
  /** Board-local Y where marbles spawn (above the start line). */
  startY: number;
  /**
   * Height of the hopper above `startY` that the board, walls and glass must
   * cover.
   *
   * Large fields spawn in stacked rows, and any row above the board's top edge
   * has nothing behind or in front of it — those marbles fall straight out of
   * the world. This must therefore accommodate the largest supported field:
   * `ceil(playerLimit / marblesPerRow) * rowPitch`.
   */
  startAreaHeight: number;
  /** Board-local Y of the first generated obstacle row. */
  firstRowY: number;
  /** Board-local Y of the finish trigger's centre. */
  finishY: number;
  /** Height of the finish trigger volume. */
  finishHeight: number;
  /**
   * Clearance every blocking obstacle must leave between its outer edge and
   * the side wall.
   *
   * An obstacle that reaches the wall creates a dead end: a marble sliding
   * along its face runs into the wall and stops, with no down-board force left
   * to free it. This gap guarantees a drain past every obstacle and must stay
   * comfortably wider than a marble.
   */
  minDrainGap: number;
  /**
   * How often, in board-local Y, to drop a launch pad into each side lane.
   *
   * These are what make the edges lively rather than a quiet bypass: a marble
   * running down a wall gets flung back up the board instead of coasting home.
   */
  edgeLauncherSpacing: number;
  /**
   * Height of the launcher-free run-in immediately above the finish line.
   *
   * Without it, a marble arriving at the line can be thrown back up the board
   * indefinitely and the race never resolves. This stretch guarantees that
   * whatever reaches it can actually finish, while leaving the rest of the
   * board as chaotic as it likes.
   */
  launcherFreeRunIn: number;
  /**
   * Launcher-free drop below the start line, measured from `firstRowY`.
   *
   * The field leaves the gate packed shoulder to shoulder and hugging the side
   * walls. A kicker inside that zone catches the outermost marbles the instant
   * they drop and fires them straight back into the hopper, over and over, so
   * they appear stuck at the start while everyone else races away. The opening
   * rows are bumpers for the same reason: the pack has to spread out before
   * anything dramatic is fair.
   */
  launcherFreeStart: number;
}

export const DEFAULT_TRACK_CONFIG: TrackConfig = {
  tiltDegrees: 26,
  width: 18,
  depth: 1.55,
  // Far thicker than it needs to be for a single-step crossing. Marbles are not
  // only fast now, they get squeezed against the walls in crowds, and Bullet's
  // penetration recovery can shove one clean through a thin barrier.
  wallThickness: 1.6,
  rowSpacing: 5.4,
  startY: 2.6,
  startAreaHeight: 16,
  firstRowY: -4.5,
  finishY: -189,
  finishHeight: 3,
  minDrainGap: 1.3,
  edgeLauncherSpacing: 13,
  launcherFreeRunIn: 16,
  launcherFreeStart: 18,
};

/** Number of obstacle rows a track of this length holds. */
export function rowCount(config: TrackConfig): number {
  const span = config.firstRowY - (config.finishY + config.finishHeight);
  return Math.max(1, Math.floor(span / config.rowSpacing));
}

/**
 * Vertical extent the board slab, side walls and front glass must cover:
 * from the top of the start hopper down past the catcher.
 *
 * Shared by all three so they cannot drift apart — a wall shorter than the
 * board would let marbles escape at exactly the point nobody thinks to check.
 */
export function boardExtent(config: TrackConfig): { top: number; bottom: number; height: number; centre: number } {
  const top = config.startY + config.startAreaHeight;
  const bottom = config.finishY - config.finishHeight * 3;
  const height = top - bottom;
  return { top, bottom, height, centre: (top + bottom) / 2 };
}

/** Marbles per row on the start grid, and the pitch between stacked rows. */
export const START_GRID = {
  minSpacing: 1.3,
  rowPitch: 1.25,
} as const;
