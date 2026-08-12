import * as pc from 'playcanvas';
import type { GameConfig } from '../core/GameConfig';
import type { PhysicsConfig } from '../physics/PhysicsConfig';
import type { RandomManager } from '../random/RandomManager';
import type { ProgressSource } from '../race/RaceManager';
import type { MarbleId, Participant } from '../race/RaceResult';
import type { Track } from '../track/Track';
import type { MaterialFactory } from '../visual/MaterialFactory';
import { Marble } from './Marble';

/**
 * Owns every marble and the per-step housekeeping they need.
 *
 * Implements ProgressSource so RaceManager can rank unfinished marbles at
 * timeout without ever learning what a position is (PRD §3.2).
 */
export class MarbleManager implements ProgressSource {
  readonly root: pc.Entity;
  private readonly marbles: Marble[] = [];
  private readonly byId = new Map<MarbleId, Marble>();
  private readonly nudge = new pc.Vec3();
  private readonly scratch = new pc.Vec3();

  constructor(
    private readonly physics: PhysicsConfig,
    private readonly game: GameConfig,
    private readonly materials: MaterialFactory,
    /**
     * The manager outlives any single race, so it holds the RandomManager and
     * resolves its stream per use. Caching a RandomStream in the constructor
     * would keep a generator alive across `setSeed`, which silently makes every
     * race after the first unreproducible.
     */
    private readonly randomManager: RandomManager,
    private readonly streamName: string,
  ) {
    this.root = new pc.Entity('marbles');
  }

  private get random() {
    return this.randomManager.stream(this.streamName);
  }

  get all(): readonly Marble[] {
    return this.marbles;
  }

  get(id: MarbleId): Marble | undefined {
    return this.byId.get(id);
  }

  /** Looks up the marble owning an entity, for trigger callbacks. */
  fromEntity(entity: pc.Entity): Marble | undefined {
    return this.byId.get(entity.name);
  }

  /** Destroys the current field and builds one for `participants`. */
  spawn(participants: readonly Participant[], track: Track): void {
    this.clear();
    for (const participant of participants) {
      const marble = new Marble(participant, this.physics, this.materials);
      this.marbles.push(marble);
      this.byId.set(marble.id, marble);
      this.root.addChild(marble.entity);
    }
    this.placeAtStart(track);
  }

  /**
   * Puts every marble on the start line with a small seeded offset.
   *
   * The jitter is what stops a perfectly symmetric field from producing a
   * degenerate, identical-looking race — and because it comes from the seeded
   * stream, the same seed still reproduces the same start (PRD §8).
   */
  placeAtStart(track: Track): void {
    const count = this.marbles.length;
    const spread = this.physics.marbleRadius * 0.45;

    this.marbles.forEach((marble, index) => {
      const position = track.startSlotWorld(
        index,
        count,
        this.random.spread(spread),
        this.random.spread(spread * 0.6),
      );
      marble.teleportTo(position);
    });
  }

  /**
   * Fixed-step housekeeping: speed clamping, progress tracking and stuck
   * rescue. Runs before the physics step so the changes take effect this tick.
   */
  update(dt: number, track: Track, racing: boolean): void {
    const downhill = track.downhill;
    const outward = track.outward;
    const uphill = track.uphill;
    const hopperFloor = track.hopperFloorY;

    for (const marble of this.marbles) {
      marble.clampSpeed();
      marble.decayLaunchFatigue(dt);

      // Put back anything the solver squeezed out of the cavity, before its
      // position feeds progress tracking — an escaped marble reports absurd
      // progress and would poison the standings as well as being lost.
      const corrected = track.cavityCorrection(marble.position, this.physics.marbleRadius);
      if (corrected) marble.recoverTo(corrected);

      const progress = track.progressOf(marble.position);
      if (progress > marble.bestProgress) marble.bestProgress = progress;

      if (!racing || marble.finished) continue;

      this.brakeInHopper(marble, track, uphill, hopperFloor);

      // A marble wedged against an obstacle would otherwise hang the race until
      // the timeout. The nudge combines three components, and all three matter:
      // downhill to resume the race, a seeded sideways kick so it doesn't wedge
      // in the same place twice, and a lift off the board face — because the
      // traps that actually occur are corners between an obstacle and the board,
      // and a purely downhill push just presses the marble further into them.
      if (marble.updateStuck(dt, this.game.stuckSpeedThreshold, this.game.stuckGraceSeconds)) {
        // Escalates while the marble keeps getting re-caught in the same spot.
        const impulse = this.game.stuckNudgeImpulse * marble.registerRescue();

        this.nudge.copy(downhill).mulScalar(impulse);
        this.nudge.add(this.scratch.copy(outward).mulScalar(impulse * 0.55));
        this.nudge.x += this.random.spread(impulse * 0.6);

        // Activate first: an impulse applied to a sleeping body is discarded.
        marble.body?.activate();
        marble.body?.applyImpulse(this.nudge.x, this.nudge.y, this.nudge.z);
      }
    }
  }

  /**
   * Bleeds off upward speed once a marble is thrown back above the first
   * obstacle row.
   *
   * A launcher can fling a marble more than fifty units at full speed, which is
   * far enough to clear the start line from well down the board. The hopper up
   * there is a smooth empty box with nothing to redirect anything, so a marble
   * that reaches it ricochets between the ceiling, glass and walls for ages and
   * looks, from the outside, exactly like one that refuses to fall.
   *
   * Braking only the up-board component leaves sideways and outward motion
   * untouched, so the marble arcs back into play rather than being frozen. It
   * runs on the fixed step and applies to every marble identically, so it costs
   * nothing in determinism or fairness.
   */
  private brakeInHopper(
    marble: Marble,
    track: Track,
    uphill: pc.Vec3,
    hopperFloor: number,
  ): void {
    if (track.localY(marble.position) <= hopperFloor) return;

    const body = marble.body;
    if (!body) return;

    this.scratch.copy(body.linearVelocity);
    const climbing = this.scratch.dot(uphill);
    if (climbing <= 0) return;

    // Remove most of the climb; what remains keeps the motion looking natural.
    this.nudge.copy(uphill).mulScalar(-climbing * MarbleManager.HOPPER_BRAKE);
    this.scratch.add(this.nudge);
    body.linearVelocity = this.scratch;
  }

  /** Fraction of upward speed removed per step inside the hopper. */
  private static readonly HOPPER_BRAKE = 0.12;

  /** Unfinished marbles, furthest down the board first (PRD §26 timeout rule). */
  rankUnfinishedByProgress(): MarbleId[] {
    return this.marbles
      .filter((marble) => !marble.finished)
      .sort((a, b) => b.bestProgress - a.bestProgress)
      .map((marble) => marble.id);
  }

  /** Marbles ordered by race position right now, for the live leaderboard. */
  standings(): Marble[] {
    return [...this.marbles].sort((a, b) => b.bestProgress - a.bestProgress);
  }

  /** Centroid of the marbles still racing — what the race camera tracks. */
  activeCentroid(out = new pc.Vec3()): pc.Vec3 {
    out.set(0, 0, 0);
    let count = 0;
    for (const marble of this.marbles) {
      if (marble.finished) continue;
      out.add(marble.position);
      count++;
    }
    if (count === 0) return this.leaderPosition(out);
    return out.mulScalar(1 / count);
  }

  /** Position of the marble furthest down the board. */
  leaderPosition(out = new pc.Vec3()): pc.Vec3 {
    let best: Marble | undefined;
    for (const marble of this.marbles) {
      if (!best || marble.bestProgress > best.bestProgress) best = marble;
    }
    return best ? out.copy(best.position) : out.set(0, 0, 0);
  }

  /** Best progress among marbles still racing, 0..1. */
  get leadProgress(): number {
    let best = 0;
    for (const marble of this.marbles) {
      if (marble.bestProgress > best) best = marble.bestProgress;
    }
    return best;
  }

  clear(): void {
    for (const marble of this.marbles) marble.destroy();
    this.marbles.length = 0;
    this.byId.clear();
  }

  destroy(): void {
    this.clear();
    this.root.destroy();
  }
}
