/**
 * Declarative track description. Plain serialisable data: no PlayCanvas types,
 * no functions. A track is JSON, which is what makes seed sharing, a future
 * track editor and server-side verification (PRD §31) cheap rather than a
 * rewrite.
 *
 * All coordinates are board-local (see TrackConfig).
 */

export type ObstacleKind =
  | 'bumper'
  | 'slantedWall'
  | 'verticalWall'
  | 'narrowPassage'
  | 'splitter'
  | 'funnel'
  | 'rotor'
  | 'deflector'
  | 'launcher'
  | 'meltBall';

interface ObstacleBase {
  kind: ObstacleKind;
  /** Board-local X of the piece's centre. */
  x: number;
  /** Board-local Y of the piece's centre. */
  y: number;
}

export interface BumperSpec extends ObstacleBase {
  kind: 'bumper';
  radius: number;
}

export interface SlantedWallSpec extends ObstacleBase {
  kind: 'slantedWall';
  length: number;
  /** Rotation about the board normal, in degrees. */
  angle: number;
}

export interface VerticalWallSpec extends ObstacleBase {
  kind: 'verticalWall';
  length: number;
}

export interface NarrowPassageSpec extends ObstacleBase {
  kind: 'narrowPassage';
  /** Width of the opening between the two blocks. */
  gap: number;
}

export interface SplitterSpec extends ObstacleBase {
  kind: 'splitter';
  /** Base width of the wedge. */
  width: number;
  /** Height of the wedge along +Y. */
  height: number;
}

/**
 * Converging walls. `y` is the **mouth** line; the funnel occupies `height`
 * *below* it. Building upward instead made the mouth intrude into the row
 * above, leaving a marble-high slot that trapped whole groups against the
 * side wall.
 */
export interface FunnelSpec extends ObstacleBase {
  kind: 'funnel';
  /** Width of the funnel mouth. */
  mouth: number;
  /** Width of the throat the marbles are squeezed into. */
  throat: number;
  height: number;
}

export interface RotorSpec extends ObstacleBase {
  kind: 'rotor';
  /** Length of the paddle bar. */
  length: number;
  /** Degrees per second about the board normal. Sign sets direction. */
  speed: number;
  /** Starting rotation in degrees, so rotors don't all start aligned. */
  phase: number;
}

export interface DeflectorSpec extends ObstacleBase {
  kind: 'deflector';
  /** Radius of the trigger volume. */
  radius: number;
  /** Impulse magnitude applied along board-local X on entry. */
  strength: number;
}

/**
 * A pinball-style kicker: anything entering is thrown back *up* the board.
 *
 * Deliberately a trigger rather than a solid pad. A solid launcher would be one
 * more surface a marble could come to rest against — the failure mode that
 * previously ran races to the timeout — whereas a pass-through kicker can be
 * dropped anywhere, including hard against a side wall, without ever creating
 * a dead end.
 */
export interface LauncherSpec extends ObstacleBase {
  kind: 'launcher';
  /** Half-width of the trigger volume along board X. */
  width: number;
  /** Half-height of the trigger volume along board Y. */
  height: number;
  /** Impulse magnitude applied up the board. */
  strength: number;
  /**
   * Sideways bias, -1..1, applied as a fraction of `strength`. Keeps a marble
   * from landing back on the same pad and bouncing there indefinitely.
   */
  lateral: number;
}

/**
 * A white ball that dissolves two seconds after anything touches it.
 *
 * Placed as two nearly solid rows across the middle of the board, so the field
 * arrives at a wall it cannot pass and has to eat through. Because they only
 * ever vanish, a dense pack is safe here in a way it would not be for any other
 * obstacle — the barrier is guaranteed temporary.
 */
export interface MeltBallSpec extends ObstacleBase {
  kind: 'meltBall';
  radius: number;
  /** Seconds from first contact until it disappears. */
  meltSeconds: number;
}

export type ObstacleSpec =
  | BumperSpec
  | SlantedWallSpec
  | VerticalWallSpec
  | NarrowPassageSpec
  | SplitterSpec
  | FunnelSpec
  | RotorSpec
  | DeflectorSpec
  | LauncherSpec
  | MeltBallSpec;

export interface TrackRow {
  /** Board-local Y of the row's centre line. */
  y: number;
  obstacles: ObstacleSpec[];
}

export interface TrackLayout {
  /** Seed the layout was generated from. */
  seed: number;
  width: number;
  rows: TrackRow[];
}

/** Flattens a layout to a single obstacle list, for building and for tests. */
export function allObstacles(layout: TrackLayout): ObstacleSpec[] {
  return layout.rows.flatMap((row) => row.obstacles);
}
