import type { FinishRecord, MarbleId } from './RaceResult';

/**
 * Owns finishing order (PRD §10). Pure — knows marble ids and times, nothing
 * about entities, triggers or rendering.
 *
 * The one invariant that matters: a marble can be recorded exactly once. A
 * physics trigger can fire repeatedly as a marble rolls through the volume, so
 * the guard here is what stands between us and duplicated ranks.
 */
export class RankingManager {
  private readonly finished: FinishRecord[] = [];
  private readonly seen = new Set<MarbleId>();

  /**
   * Records a finish. Returns the new record, or null if this marble already
   * finished — callers use the null to suppress duplicate effects and sounds.
   */
  recordFinish(id: MarbleId, time: number): FinishRecord | null {
    if (this.seen.has(id)) return null;
    this.seen.add(id);

    const record: FinishRecord = { id, rank: this.finished.length + 1, time, dnf: false };
    this.finished.push(record);
    return record;
  }

  hasFinished(id: MarbleId): boolean {
    return this.seen.has(id);
  }

  get finishedCount(): number {
    return this.finished.length;
  }

  /** Finishers so far, in order. */
  get records(): readonly FinishRecord[] {
    return this.finished;
  }

  /** Rank a marble would receive if it finished right now. */
  get nextRank(): number {
    return this.finished.length + 1;
  }

  /**
   * Closes the race, appending everyone who never reached the finish.
   * `remaining` must already be ordered best-progress-first; the caller owns
   * that judgement because progress is a physics-layer concept.
   */
  finalise(remaining: readonly MarbleId[]): FinishRecord[] {
    for (const id of remaining) {
      if (this.seen.has(id)) continue;
      this.seen.add(id);
      this.finished.push({ id, rank: this.finished.length + 1, time: null, dnf: true });
    }
    return [...this.finished];
  }

  reset(): void {
    this.finished.length = 0;
    this.seen.clear();
  }
}
