import { GameState, GameStateMachine, type StateChange } from '../core/GameState';
import type { GameConfig } from '../core/GameConfig';
import { Emitter } from '../util/Emitter';
import { RankingManager } from './RankingManager';
import {
  ENGINE_VERSION,
  type FinishRecord,
  type MarbleId,
  type Participant,
  type RaceResult,
} from './RaceResult';

/**
 * The scene layer implements this so RaceManager can rank marbles that never
 * finished, without knowing what a position or an entity is.
 */
export interface ProgressSource {
  /** Unfinished marble ids, ordered by how far down the track they are. */
  rankUnfinishedByProgress(): MarbleId[];
}

export interface RaceEvents {
  stateChange: StateChange;
  /** 3, 2, 1 — then 0 meaning "GO!". */
  countdown: { value: number };
  raceStart: { seed: number };
  marbleFinished: { record: FinishRecord; participant: Participant };
  /** Emitted once when the final marble is accounted for. */
  raceComplete: { result: RaceResult };
  /** Every fixed step while racing. */
  tick: { elapsed: number };
}

/**
 * Drives the race lifecycle (PRD §11, §12). Pure game logic: it advances on
 * fixed-size ticks handed to it by the loop and never touches PlayCanvas.
 *
 * Everything physical — opening the gate, moving marbles — happens in response
 * to the events emitted here, which is what keeps rules separable from
 * simulation (PRD §3.2).
 */
export class RaceManager {
  readonly events = new Emitter<RaceEvents>();
  readonly ranking = new RankingManager();
  readonly stateMachine = new GameStateMachine();

  private participants: Participant[] = [];
  private participantsById = new Map<MarbleId, Participant>();
  private seed = 0;
  private startedAt = 0;
  private elapsed = 0;
  private phaseTimer = 0;
  private lastCountdownValue = Number.POSITIVE_INFINITY;
  private result: RaceResult | null = null;
  /** While false, READY holds indefinitely instead of counting down. */
  private armed = false;

  constructor(
    private readonly config: GameConfig,
    private readonly progress: ProgressSource,
  ) {
    this.stateMachine.onChange((change) => this.events.emit('stateChange', change));
  }

  get state(): GameState {
    return this.stateMachine.state;
  }

  get elapsedTime(): number {
    return this.elapsed;
  }

  get currentSeed(): number {
    return this.seed;
  }

  get roster(): readonly Participant[] {
    return this.participants;
  }

  get lastResult(): RaceResult | null {
    return this.result;
  }

  participant(id: MarbleId): Participant | undefined {
    return this.participantsById.get(id);
  }

  /**
   * Sets up a race and holds it at the start line.
   *
   * `armed` is what separates "showing the grid" from "counting down". The
   * opening screen deliberately waits for the player to press START rather
   * than running on its own, for two reasons: they need a chance to pick the
   * line-up, and browsers refuse to play any audio until the page has seen a
   * real user gesture — an auto-started first race is always silent.
   */
  prepare(participants: Participant[], seed: number, armed = false): void {
    if (!this.stateMachine.is(GameState.IDLE)) {
      this.stateMachine.reset();
    }
    this.participants = participants;
    this.participantsById = new Map(participants.map((p) => [p.id, p]));
    this.seed = seed >>> 0;
    this.elapsed = 0;
    this.phaseTimer = 0;
    this.lastCountdownValue = Number.POSITIVE_INFINITY;
    this.result = null;
    this.armed = armed;
    this.ranking.reset();
    this.stateMachine.transitionTo(GameState.READY);
  }

  /** Releases a prepared race so its countdown begins. */
  arm(): void {
    if (!this.stateMachine.is(GameState.READY)) return;
    this.armed = true;
    this.phaseTimer = 0;
  }

  get isArmed(): boolean {
    return this.armed;
  }

  /** Skips the READY hold and begins counting down immediately. */
  startCountdown(): void {
    if (!this.stateMachine.is(GameState.READY)) return;
    this.phaseTimer = 0;
    this.lastCountdownValue = Number.POSITIVE_INFINITY;
    this.stateMachine.transitionTo(GameState.COUNTDOWN);
  }

  /**
   * Advances the race by one fixed step. `dt` is always FIXED_TIMESTEP, which
   * is why race timing is reproducible rather than frame-rate dependent.
   */
  tick(dt: number): void {
    switch (this.stateMachine.state) {
      case GameState.READY:
        this.tickReady(dt);
        break;
      case GameState.COUNTDOWN:
        this.tickCountdown(dt);
        break;
      case GameState.RACING:
        this.tickRacing(dt);
        break;
      case GameState.FINISHED:
        this.tickFinished(dt);
        break;
      default:
        break;
    }
  }

  private tickReady(dt: number): void {
    // An unarmed race waits at the line forever — that is the start screen.
    if (!this.armed) return;

    this.phaseTimer += dt;
    if (this.phaseTimer >= this.config.readyHoldSeconds) {
      this.startCountdown();
    }
  }

  private tickCountdown(dt: number): void {
    this.phaseTimer += dt;
    const remaining = this.config.countdownSeconds - this.phaseTimer;

    // Emit each integer beat exactly once, however many steps land inside it.
    const beat = Math.max(0, Math.ceil(remaining));
    if (beat < this.lastCountdownValue) {
      this.lastCountdownValue = beat;
      this.events.emit('countdown', { value: beat });
    }

    if (remaining <= 0) {
      this.beginRace();
    }
  }

  private beginRace(): void {
    this.startedAt = Date.now();
    this.elapsed = 0;
    this.phaseTimer = 0;
    this.stateMachine.transitionTo(GameState.RACING);
    this.events.emit('raceStart', { seed: this.seed });
  }

  private tickRacing(dt: number): void {
    this.elapsed += dt;
    this.events.emit('tick', { elapsed: this.elapsed });

    if (this.ranking.finishedCount >= this.participants.length) {
      this.completeRace();
      return;
    }
    if (this.elapsed >= this.config.raceTimeoutSeconds) {
      this.completeRace();
    }
  }

  private tickFinished(dt: number): void {
    this.phaseTimer += dt;
    if (this.phaseTimer >= this.config.resultDelaySeconds) {
      this.stateMachine.transitionTo(GameState.RESULT);
    }
  }

  /**
   * Reports that a marble entered the finish zone. Safe to call repeatedly for
   * the same marble; only the first call counts (PRD §10).
   */
  reportFinish(id: MarbleId): FinishRecord | null {
    if (!this.stateMachine.is(GameState.RACING)) return null;

    const participant = this.participantsById.get(id);
    if (!participant) return null;

    const record = this.ranking.recordFinish(id, this.elapsed);
    if (!record) return null;

    this.events.emit('marbleFinished', { record, participant });
    return record;
  }

  private completeRace(): void {
    // Anyone still on the track is ranked by how far they got, then marked DNF.
    const records = this.ranking.finalise(this.progress.rankUnfinishedByProgress());

    this.result = {
      seed: this.seed,
      startedAt: this.startedAt,
      duration: this.elapsed,
      playerCount: this.participants.length,
      engineVersion: ENGINE_VERSION,
      finishOrder: records.map((record) => record.id),
      records,
    };

    this.phaseTimer = 0;
    this.stateMachine.transitionTo(GameState.FINISHED);
    this.events.emit('raceComplete', { result: this.result });
  }

  /** Returns to IDLE so a new race can be prepared. */
  reset(): void {
    this.stateMachine.reset();
    this.ranking.reset();
    this.elapsed = 0;
    this.phaseTimer = 0;
  }
}
