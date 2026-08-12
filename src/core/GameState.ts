/**
 * Race lifecycle (PRD §11). Pure — this file must never import PlayCanvas.
 */
export enum GameState {
  IDLE = 'IDLE',
  READY = 'READY',
  COUNTDOWN = 'COUNTDOWN',
  RACING = 'RACING',
  FINISHED = 'FINISHED',
  RESULT = 'RESULT',
}

/**
 * Legal transitions. Anything not listed here is a bug, and the state machine
 * says so loudly rather than silently corrupting the race.
 */
const TRANSITIONS: Record<GameState, readonly GameState[]> = {
  [GameState.IDLE]: [GameState.READY],
  [GameState.READY]: [GameState.COUNTDOWN, GameState.IDLE],
  [GameState.COUNTDOWN]: [GameState.RACING, GameState.IDLE],
  [GameState.RACING]: [GameState.FINISHED, GameState.IDLE],
  [GameState.FINISHED]: [GameState.RESULT, GameState.IDLE],
  [GameState.RESULT]: [GameState.READY, GameState.IDLE],
};

export interface StateChange {
  from: GameState;
  to: GameState;
}

export class GameStateMachine {
  private current: GameState = GameState.IDLE;
  private readonly observers: Array<(change: StateChange) => void> = [];

  get state(): GameState {
    return this.current;
  }

  is(...states: GameState[]): boolean {
    return states.includes(this.current);
  }

  canTransitionTo(next: GameState): boolean {
    return TRANSITIONS[this.current].includes(next);
  }

  /** Throws on an illegal transition — these are programming errors, not input errors. */
  transitionTo(next: GameState): StateChange {
    if (!this.canTransitionTo(next)) {
      throw new Error(`Illegal state transition: ${this.current} -> ${next}`);
    }
    const change: StateChange = { from: this.current, to: next };
    this.current = next;
    for (const observer of [...this.observers]) observer(change);
    return change;
  }

  onChange(observer: (change: StateChange) => void): () => void {
    this.observers.push(observer);
    return () => {
      const index = this.observers.indexOf(observer);
      if (index >= 0) this.observers.splice(index, 1);
    };
  }

  /** Returns to IDLE from any state. Used by RESET. */
  reset(): void {
    this.transitionTo(GameState.IDLE);
  }
}
