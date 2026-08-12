import * as pc from 'playcanvas';
import {
  FIXED_TIMESTEP,
  MAX_FRAME_DELTA,
  MAX_STEPS_PER_FRAME,
} from '../physics/PhysicsConfig';

export type FixedStepHandler = (dt: number) => void;

/**
 * Fixed-timestep accumulator (PRD §18).
 *
 * Real elapsed time goes in; whole FIXED_TIMESTEP steps come out. The
 * simulation therefore never sees a variable delta, so a seed produces the same
 * finish order at 30, 60, 120 or 144 Hz.
 *
 * Slow motion scales the *incoming* real time only. Step size is constant, so a
 * dramatic slow-mo finish cannot alter the result it is dramatising.
 */
export class GameLoop {
  private accumulator = 0;
  private timeScale = 1;
  private running = false;
  private readonly handlers: FixedStepHandler[] = [];
  private stepsLastFrame = 0;

  constructor(private readonly app: pc.Application) {}

  /** Registers a handler called once per fixed step, in registration order. */
  onFixedStep(handler: FixedStepHandler): () => void {
    this.handlers.push(handler);
    return () => {
      const index = this.handlers.indexOf(handler);
      if (index >= 0) this.handlers.splice(index, 1);
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    // The engine still owns requestAnimationFrame and rendering; we only take
    // over what happens *inside* a frame.
    this.app.on('update', this.onFrame, this);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.app.off('update', this.onFrame, this);
  }

  /** 1 = real time, 0.25 = quarter speed. Clamped to sane values. */
  setTimeScale(scale: number): void {
    this.timeScale = Math.max(0, Math.min(4, scale));
  }

  getTimeScale(): number {
    return this.timeScale;
  }

  /** Fixed steps consumed in the most recent frame — surfaced in the debug panel. */
  get lastStepCount(): number {
    return this.stepsLastFrame;
  }

  /** Drops accumulated time. Call after a long pause so the sim doesn't sprint. */
  flush(): void {
    this.accumulator = 0;
  }

  private onFrame(frameDelta: number): void {
    // Clamping here is what prevents a spiral of death: after a stall (tab in
    // the background, a GC pause) we discard the excess rather than trying to
    // simulate minutes of physics in one frame.
    const scaled = Math.min(frameDelta * this.timeScale, MAX_FRAME_DELTA);
    this.accumulator += scaled;

    let steps = 0;
    while (this.accumulator >= FIXED_TIMESTEP && steps < MAX_STEPS_PER_FRAME) {
      for (const handler of this.handlers) handler(FIXED_TIMESTEP);
      this.accumulator -= FIXED_TIMESTEP;
      steps++;
    }
    this.stepsLastFrame = steps;
  }
}
