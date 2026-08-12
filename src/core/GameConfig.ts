/**
 * Top-level game rules. Pure data — no PlayCanvas, no DOM.
 */
export interface GameConfig {
  /**
   * Fallback field size, used only when no line-up is supplied.
   *
   * The opening race normally takes its size from the checkbox roster, so this
   * matches the default roster length rather than the PRD §6 prototype figure
   * of 10.
   */
  maxPlayers: number;
  /** Lower bound accepted from URL params / UI. */
  minPlayers: number;
  /** Upper bound accepted from URL params / UI. */
  playerLimit: number;
  /** Seconds of "3 / 2 / 1 / GO!" before the gate opens. */
  countdownSeconds: number;
  /** Seconds after READY before the countdown auto-starts. */
  readyHoldSeconds: number;
  /** Hard cap on race length. Unfinished marbles are ranked DNF (PRD §26). */
  raceTimeoutSeconds: number;
  /** Delay between the last finisher and the result screen. */
  resultDelaySeconds: number;
  /** A marble slower than this (units/s) counts as potentially stuck. */
  stuckSpeedThreshold: number;
  /** Seconds below `stuckSpeedThreshold` before a rescue nudge is applied. */
  stuckGraceSeconds: number;
  /** Impulse magnitude of the rescue nudge. */
  stuckNudgeImpulse: number;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  maxPlayers: 13,
  minPlayers: 2,
  playerLimit: 100,
  countdownSeconds: 3,
  readyHoldSeconds: 1.2,
  // Generous: the board is long and launchers routinely throw marbles back up
  // it, so a legitimate race can run well past the time a straight descent takes.
  raceTimeoutSeconds: 180,
  resultDelaySeconds: 1.4,
  stuckSpeedThreshold: 0.35,
  stuckGraceSeconds: 1.5,
  stuckNudgeImpulse: 3.2,
};

export function clampPlayerCount(count: number, config: GameConfig): number {
  if (!Number.isFinite(count)) return config.maxPlayers;
  return Math.min(config.playerLimit, Math.max(config.minPlayers, Math.floor(count)));
}
