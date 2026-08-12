import { requireElement } from './dom';

export interface DebugStats {
  fps: number;
  marbles: number;
  fixedSteps: number;
  state: string;
  elapsed: number;
  seed: number;
}

/**
 * Frame-rate and simulation readout, toggled with the D key.
 *
 * This exists to make the PRD §26 performance checks (10 / 25 / 50 / 100
 * marbles) something you can actually observe rather than guess at.
 */
export class DebugPanel {
  private readonly root: HTMLElement;
  private visible = false;

  private frames = 0;
  private accumulated = 0;
  private fps = 0;

  constructor() {
    this.root = requireElement('debug');
    window.addEventListener('keydown', (event) => {
      if (event.key !== 'd' && event.key !== 'D') return;
      // Otherwise typing a seed containing "d" toggles the panel underneath you.
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      this.toggle();
    });
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.hidden = !this.visible;
  }

  /** Call once per rendered frame with the real frame delta. */
  update(dt: number, stats: Omit<DebugStats, 'fps'>): void {
    this.frames++;
    this.accumulated += dt;
    if (this.accumulated >= 0.5) {
      this.fps = this.frames / this.accumulated;
      this.frames = 0;
      this.accumulated = 0;
    }

    if (!this.visible) return;

    this.root.textContent = [
      `FPS      ${this.fps.toFixed(0)}`,
      `MARBLES  ${stats.marbles}`,
      `STEPS/F  ${stats.fixedSteps}`,
      `STATE    ${stats.state}`,
      `T        ${stats.elapsed.toFixed(2)}s`,
      `SEED     ${stats.seed}`,
    ].join('\n');
  }
}
