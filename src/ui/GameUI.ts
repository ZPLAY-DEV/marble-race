import { GameState } from '../core/GameState';
import { requireElement } from './dom';

export interface GameUIHandlers {
  onStart(seed: number | null): void;
  onReset(): void;
  onToggleSound(): boolean;
  /** Toggles the whole-board view. Returns true when it is now active. */
  onToggleView(): boolean;
  /** Wheel zoom: `delta` is a signed fraction to scale camera distance by. */
  onZoom(delta: number): void;
}

/**
 * Chrome around the canvas: title, seed readout, player count, buttons
 * (PRD §15).
 *
 * The UI never reads game state directly — Game pushes state into it. That
 * one-way flow is what keeps rendering and rules decoupled (PRD §24).
 */
export class GameUI {
  private readonly seedReadout: HTMLElement;
  private readonly playerReadout: HTMLElement;
  private readonly seedInput: HTMLInputElement;
  private readonly startButton: HTMLButtonElement;
  private readonly resetButton: HTMLButtonElement;
  private readonly soundButton: HTMLButtonElement;
  private readonly viewButton: HTMLButtonElement;
  private readonly title: HTMLElement;
  private readonly boot: HTMLElement;

  constructor(handlers: GameUIHandlers) {
    this.seedReadout = requireElement('seed-readout');
    this.playerReadout = requireElement('player-readout');
    this.seedInput = requireElement<HTMLInputElement>('seed-input');
    this.startButton = requireElement<HTMLButtonElement>('start-button');
    this.resetButton = requireElement<HTMLButtonElement>('reset-button');
    this.soundButton = requireElement<HTMLButtonElement>('sound-button');
    this.viewButton = requireElement<HTMLButtonElement>('view-button');
    this.title = requireElement('title');
    this.boot = requireElement('boot');

    this.title.addEventListener('click', () => this.cycleTitle());
    this.title.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.cycleTitle();
      }
    });

    this.startButton.addEventListener('click', () => {
      handlers.onStart(this.readSeed());
    });
    this.resetButton.addEventListener('click', () => handlers.onReset());
    this.soundButton.addEventListener('click', () => {
      const enabled = handlers.onToggleSound();
      this.soundButton.textContent = enabled ? 'SOUND ON' : 'SOUND OFF';
      this.soundButton.setAttribute('aria-pressed', String(enabled));
    });

    this.viewButton.addEventListener('click', () => {
      const full = handlers.onToggleView();
      this.viewButton.textContent = full ? 'FOLLOW RACE' : 'FULL BOARD';
      this.viewButton.setAttribute('aria-pressed', String(full));
    });

    // Wheel zooms the camera. Passive listener: we never preventDefault, so
    // page scrolling is unaffected (the body doesn't scroll anyway).
    window.addEventListener(
      'wheel',
      (event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('.roster, .result__panel')) return; // let panels scroll
        handlers.onZoom(event.deltaY > 0 ? 0.12 : -0.12);
      },
      { passive: true },
    );

    // Space restarts, matching the primary button.
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'Space' || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return;
      event.preventDefault();
      handlers.onStart(this.readSeed());
    });
  }

  /** Alternate titles, cycled by clicking the heading. */
  private static readonly TITLES = ['MARBLE RACE', 'ZPLAY 노예 레이스'] as const;
  private titleIndex = 0;

  private cycleTitle(): void {
    this.titleIndex = (this.titleIndex + 1) % GameUI.TITLES.length;
    const next = GameUI.TITLES[this.titleIndex];
    this.title.textContent = next;
    document.title = next;
  }

  /** Removes the loading veil once the scene is live. */
  dismissBoot(): void {
    this.boot.classList.add('boot--gone');
    window.setTimeout(() => {
      this.boot.hidden = true;
    }, 500);
  }

  setBootStatus(message: string): void {
    const status = this.boot.querySelector('.boot__status');
    if (status) status.textContent = message;
  }

  /** Shows the boot veil as a permanent error state. */
  showFatal(message: string): void {
    this.boot.hidden = false;
    this.boot.classList.remove('boot--gone');
    this.setBootStatus(message);
  }

  setSeed(seed: number): void {
    this.seedReadout.replaceChildren('SEED ', Object.assign(document.createElement('b'), {
      textContent: String(seed),
    }));
  }

  setPlayerCount(count: number): void {
    this.playerReadout.textContent = `${count} PLAYER${count === 1 ? '' : 'S'}`;
  }

  /** Enables or disables controls to match the lifecycle stage. */
  syncState(state: GameState): void {
    const racing = state === GameState.COUNTDOWN || state === GameState.RACING;
    this.startButton.disabled = racing;
    this.seedInput.disabled = racing;
    this.startButton.textContent = state === GameState.RESULT ? 'RACE AGAIN' : 'START RACE';
  }

  /** Greys out START when the line-up is too small to race. */
  setStartEnabled(enabled: boolean): void {
    this.startButton.disabled = !enabled;
  }

  /** Returns null when the seed box is empty, meaning "pick a fresh one". */
  private readSeed(): number | null {
    const raw = this.seedInput.value.trim();
    if (raw === '') return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed >>> 0 : null;
  }
}
