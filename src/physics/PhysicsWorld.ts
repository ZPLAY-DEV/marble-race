import * as pc from 'playcanvas';
import { FIXED_TIMESTEP, type PhysicsConfig } from './PhysicsConfig';

/**
 * Takes manual control of Ammo stepping so the simulation advances only in
 * exact FIXED_TIMESTEP increments (PRD §18).
 *
 * PlayCanvas normally subscribes its rigidbody system to the app's `update`
 * event and feeds it the raw frame delta, which makes results depend on the
 * display refresh rate. We unsubscribe it and drive `onUpdate` ourselves from
 * GameLoop's accumulator instead, with `maxSubSteps = 1` so Bullet cannot
 * silently substep on its own. This file is the only place that reaches into
 * engine internals.
 */
export class PhysicsWorld {
  private readonly system: pc.RigidBodyComponentSystem;
  private detached = false;

  constructor(
    private readonly app: pc.Application,
    config: PhysicsConfig,
  ) {
    const system = app.systems.rigidbody;
    if (!system) {
      throw new Error('PhysicsWorld: rigidbody system unavailable — did Ammo load?');
    }
    this.system = system;

    system.gravity.set(0, config.gravity, 0);
    system.fixedTimeStep = FIXED_TIMESTEP;
    system.maxSubSteps = 1;
  }

  /**
   * Detaches the engine's automatic stepping. Must run after the app has
   * started, because `setPhysicsWorld` is what installs the subscription.
   */
  takeManualControl(): void {
    if (this.detached) return;
    // Matches the registration in RigidBodyComponentSystem.setPhysicsWorld.
    this.app.systems.off('update', this.system.onUpdate, this.system);
    this.detached = true;
  }

  /** Advances the simulation exactly one fixed step. */
  step(): void {
    if (!this.system.physicsWorld) return;
    this.system.onUpdate(FIXED_TIMESTEP);
  }

  /**
   * Throws away the Bullet world and builds a fresh one.
   *
   * This is what makes a seed actually reproducible. Bullet's broadphase tree
   * and the solver's warm-starting caches persist for the lifetime of a world,
   * so a second race run in the world a first race left behind starts from
   * different internal state and drifts to a different finish order — measured,
   * not assumed: identical seeds match exactly across fresh worlds and diverge
   * across reused ones.
   *
   * Every rigidbody entity must already be destroyed when this is called, or
   * their components will hold pointers into freed Ammo memory.
   */
  recreate(): void {
    const system = this.system as unknown as { _world: unknown };

    this.system.physicsWorld?.destroy();
    // onLibraryLoaded only builds a world when it doesn't already have one.
    system._world = null;
    this.system.onLibraryLoaded();

    // setPhysicsWorld re-subscribed the engine's automatic stepping, so take
    // manual control back.
    this.detached = false;
    this.takeManualControl();
  }

  get ready(): boolean {
    return Boolean(this.system.physicsWorld);
  }

  setGravity(gravity: number): void {
    this.system.gravity.set(0, gravity, 0);
  }
}
