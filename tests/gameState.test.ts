import { describe, expect, it, vi } from 'vitest';
import { GameState, GameStateMachine } from '../src/core/GameState';

describe('GameStateMachine', () => {
  it('starts IDLE', () => {
    expect(new GameStateMachine().state).toBe(GameState.IDLE);
  });

  it('walks the full lifecycle from PRD §11', () => {
    const machine = new GameStateMachine();
    const path = [
      GameState.READY,
      GameState.COUNTDOWN,
      GameState.RACING,
      GameState.FINISHED,
      GameState.RESULT,
      GameState.READY,
    ];

    for (const state of path) {
      expect(machine.canTransitionTo(state)).toBe(true);
      machine.transitionTo(state);
      expect(machine.state).toBe(state);
    }
  });

  it('rejects skipping stages', () => {
    const machine = new GameStateMachine();
    machine.transitionTo(GameState.READY);
    // Skipping the countdown would start a race nobody saw begin.
    expect(() => machine.transitionTo(GameState.FINISHED)).toThrow(/Illegal state transition/);
    expect(machine.state).toBe(GameState.READY);
  });

  it('allows abandoning to IDLE from anywhere', () => {
    for (const from of [
      GameState.READY,
      GameState.COUNTDOWN,
      GameState.RACING,
      GameState.FINISHED,
      GameState.RESULT,
    ]) {
      const machine = new GameStateMachine();
      machine.transitionTo(GameState.READY);
      if (from !== GameState.READY) {
        const order = [
          GameState.COUNTDOWN,
          GameState.RACING,
          GameState.FINISHED,
          GameState.RESULT,
        ];
        for (const step of order) {
          machine.transitionTo(step);
          if (step === from) break;
        }
      }
      expect(() => machine.reset()).not.toThrow();
      expect(machine.state).toBe(GameState.IDLE);
    }
  });

  it('notifies observers with both endpoints', () => {
    const machine = new GameStateMachine();
    const observer = vi.fn();
    machine.onChange(observer);
    machine.transitionTo(GameState.READY);

    expect(observer).toHaveBeenCalledWith({ from: GameState.IDLE, to: GameState.READY });
  });

  it('stops notifying after unsubscribe', () => {
    const machine = new GameStateMachine();
    const observer = vi.fn();
    const unsubscribe = machine.onChange(observer);
    unsubscribe();
    machine.transitionTo(GameState.READY);

    expect(observer).not.toHaveBeenCalled();
  });

  it('matches any of several states with is()', () => {
    const machine = new GameStateMachine();
    machine.transitionTo(GameState.READY);
    expect(machine.is(GameState.IDLE, GameState.READY)).toBe(true);
    expect(machine.is(GameState.RACING)).toBe(false);
  });
});
