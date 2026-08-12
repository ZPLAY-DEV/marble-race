import * as pc from 'playcanvas';
import type { PhysicsConfig } from '../physics/PhysicsConfig';
import type { Participant } from '../race/RaceResult';
import type { MaterialFactory } from '../visual/MaterialFactory';
import { MARBLE_VISUAL } from './MarbleConfig';

/**
 * One racer: a glossy sphere with a dynamic body (PRD §5).
 *
 * The marble knows its participant and its own physical state. It knows
 * nothing about ranking, cameras or UI — those read from it, never the
 * reverse.
 */
export class Marble {
  readonly entity: pc.Entity;
  readonly participant: Participant;

  /** Set once the marble crosses the line; the trigger may fire again after. */
  finished = false;
  /** Best progress reached, used to rank marbles that never finished. */
  bestProgress = 0;
  /** How many rescue nudges this marble has needed. Surfaced for diagnostics. */
  rescueCount = 0;

  private stuckTimer = 0;
  private consecutiveRescues = 0;
  private progressAtLastRescue = 0;
  private readonly velocity = new pc.Vec3();

  constructor(
    participant: Participant,
    private readonly physics: PhysicsConfig,
    materials: MaterialFactory,
  ) {
    this.participant = participant;

    const material = materials.get({
      color: participant.color,
      metalness: MARBLE_VISUAL.metalness,
      gloss: MARBLE_VISUAL.gloss,
      emissive: participant.color,
      emissiveIntensity: MARBLE_VISUAL.emissiveIntensity,
    });

    const radius = physics.marbleRadius;
    this.entity = new pc.Entity(participant.id);
    this.entity.addComponent('render', { type: 'sphere', material, castShadows: true });
    this.entity.setLocalScale(radius * 2, radius * 2, radius * 2);

    this.entity.addComponent('collision', { type: 'sphere', radius });
    this.entity.addComponent('rigidbody', {
      type: pc.BODYTYPE_DYNAMIC,
      mass: physics.marbleMass,
      friction: physics.friction,
      restitution: physics.restitution,
      linearDamping: physics.linearDamping,
      angularDamping: physics.angularDamping,
    });
    // No continuous collision detection is configured, and none is needed:
    // `maxSpeed` and FIXED_TIMESTEP are chosen so a marble advances less than
    // MIN_COLLIDER_THICKNESS per step, making tunnelling geometrically
    // impossible. tests/physicsInvariants.test.ts holds that relationship.
    this.disableDeactivation();
    this.entity.tags.add('marble');
  }

  /**
   * Stops Bullet from ever putting this marble to sleep.
   *
   * Two problems disappear at once. A marble that dozes off while wedged
   * against an obstacle reports zero velocity and ignores impulses, so the
   * rescue nudge silently does nothing and the race runs to timeout. And
   * sleep/wake decisions depend on accumulated solver state, which makes the
   * simulation diverge between otherwise identical runs — exactly the
   * reproducibility PRD §9 asks for.
   *
   * The cost is that all marbles stay in the active island for the whole race,
   * which for tens of bodies is negligible.
   */
  private disableDeactivation(): void {
    const nativeBody = this.entity.rigidbody?.body as
      | { setActivationState?(state: number): void }
      | null
      | undefined;
    nativeBody?.setActivationState?.(pc.BODYSTATE_DISABLE_DEACTIVATION);
  }

  get id(): string {
    return this.participant.id;
  }

  get body(): pc.RigidBodyComponent | undefined {
    return this.entity.rigidbody;
  }

  get position(): pc.Vec3 {
    return this.entity.getPosition();
  }

  /** Current speed in units per second. */
  get speed(): number {
    const body = this.body;
    if (!body) return 0;
    this.velocity.copy(body.linearVelocity);
    return this.velocity.length();
  }

  /** Places the marble at rest at a world position. */
  teleportTo(position: pc.Vec3): void {
    this.finished = false;
    this.bestProgress = 0;
    this.stuckTimer = 0;
    this.consecutiveRescues = 0;
    this.progressAtLastRescue = 0;
    this.rescueCount = 0;
    this.launchCharges = 0;
    this.recoveryCount = 0;
    this.stallTimer = 0;
    this.stallProgress = 0;

    this.entity.setPosition(position);
    this.entity.setEulerAngles(0, 0, 0);

    const body = this.body;
    if (!body) return;
    body.teleport(position);
    body.linearVelocity = pc.Vec3.ZERO;
    body.angularVelocity = pc.Vec3.ZERO;
    body.activate();
  }

  /**
   * Returns an escaped marble to a valid position, keeping most of its motion.
   *
   * Unlike `teleportTo`, this preserves race state and velocity: the marble is
   * mid-race and should carry on rather than restart. Velocity is damped so it
   * doesn't immediately punch back out through the same wall.
   */
  recoverTo(position: pc.Vec3): void {
    const body = this.body;
    this.entity.setPosition(position);
    if (!body) return;

    body.teleport(position);
    this.velocity.copy(body.linearVelocity).mulScalar(0.25);
    body.linearVelocity = this.velocity;
    body.activate();
    this.recoveryCount++;
  }

  /** How many times this marble had to be put back inside the board. */
  recoveryCount = 0;

  /**
   * Launch fatigue: how much lift the next kicker gives this marble.
   *
   * Launchers are strong enough to throw a marble a long way back up the
   * board, which is the point — but a marble can find a pocket where it is
   * relaunched indefinitely and the race never resolves. Each launch banks a
   * charge that saps the next one, and charges bleed off over a few seconds,
   * so a marble bouncing repeatedly loses height until it descends while one
   * that meets a kicker occasionally gets the full effect.
   *
   * Every marble is subject to the identical rule, so it costs nothing in
   * fairness (PRD §27), and it decays on the fixed step so it stays
   * reproducible.
   */
  registerLaunch(): number {
    const scale = Math.max(
      Marble.MIN_LAUNCH_SCALE,
      Math.pow(Marble.LAUNCH_FALLOFF, this.launchCharges),
    );
    this.launchCharges += 1;
    return scale;
  }

  /** Bleeds off launch fatigue. Called on the fixed step. */
  decayLaunchFatigue(dt: number): void {
    if (this.launchCharges > 0) {
      this.launchCharges = Math.max(0, this.launchCharges - dt * Marble.LAUNCH_RECOVERY);
    }
  }

  private launchCharges = 0;
  private static readonly LAUNCH_FALLOFF = 0.72;
  private static readonly MIN_LAUNCH_SCALE = 0.28;
  /** Charges recovered per second. */
  private static readonly LAUNCH_RECOVERY = 0.4;

  /**
   * Clamps speed so the marble cannot outrun collision detection.
   * Called on the fixed step, so the cap is frame-rate independent.
   */
  clampSpeed(): void {
    const body = this.body;
    if (!body) return;

    this.velocity.copy(body.linearVelocity);
    const speed = this.velocity.length();
    if (speed <= this.physics.maxSpeed) return;

    this.velocity.mulScalar(this.physics.maxSpeed / speed);
    body.linearVelocity = this.velocity;
  }

  /**
   * Tracks whether the marble is making progress, and returns true when it
   * needs a rescue nudge.
   *
   * Two independent conditions, because there are two ways to be stuck. A
   * marble wedged still is caught by the speed test. But a marble rattling in a
   * pocket — bouncing between a bumper and a wall, or circling a peg — moves
   * fast while going nowhere, and the speed test never fires for it. That was
   * the case that left one marble loitering near the start line while the rest
   * of the field raced away, so lack of *progress* is tested too.
   */
  updateStuck(dt: number, threshold: number, grace: number): boolean {
    const idle = this.speed <= threshold;
    this.stuckTimer = idle ? this.stuckTimer + dt : 0;

    // Progress is monotonic, so this measures genuine downhill advancement
    // rather than motion.
    if (this.bestProgress > this.stallProgress + Marble.STALL_EPSILON) {
      this.stallProgress = this.bestProgress;
      this.stallTimer = 0;
    } else {
      this.stallTimer += dt;
    }

    const wedged = this.stuckTimer >= grace;
    const loitering = this.stallTimer >= grace * Marble.STALL_GRACE_FACTOR;
    if (!wedged && !loitering) return false;

    this.stuckTimer = 0;
    this.stallTimer = 0;
    this.stallProgress = this.bestProgress;
    return true;
  }

  private stallTimer = 0;
  private stallProgress = 0;
  /** Progress that counts as real advancement — about 0.5% of the board. */
  private static readonly STALL_EPSILON = 0.005;
  /** Loitering is given more rope than being wedged: bouncing may yet resolve. */
  private static readonly STALL_GRACE_FACTOR = 2.5;

  /**
   * Escalation factor for the next rescue impulse.
   *
   * A marble freed by a nudge and then re-caught by the same corner would
   * otherwise loop until the timeout. Counting consecutive rescues that bought
   * no ground and scaling the impulse guarantees escape eventually, without
   * teleporting anyone — every marble is subject to the identical rule, so it
   * costs nothing in fairness (PRD §27).
   */
  registerRescue(): number {
    // "Made progress since the last rescue" resets the escalation.
    if (this.bestProgress > this.progressAtLastRescue + Marble.RESCUE_PROGRESS_EPSILON) {
      this.consecutiveRescues = 0;
    }
    this.progressAtLastRescue = this.bestProgress;
    this.consecutiveRescues++;
    this.rescueCount++;

    return Math.min(Marble.MAX_RESCUE_SCALE, 1 + this.consecutiveRescues * 0.7);
  }

  private static readonly RESCUE_PROGRESS_EPSILON = 0.004;
  private static readonly MAX_RESCUE_SCALE = 6;

  destroy(): void {
    this.entity.destroy();
  }
}
