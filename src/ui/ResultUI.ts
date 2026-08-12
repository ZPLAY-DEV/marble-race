import type { Participant, RaceResult } from '../race/RaceResult';
import { toShareParams } from '../race/RaceResult';
import { formatDuration } from '../util/math';
import { requireElement } from './dom';

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Final standings (PRD §15).
 *
 * Rows are revealed in sequence via staggered CSS animation delays rather than
 * timers, so the reveal can't desync from the DOM if the panel is closed
 * mid-animation.
 */
export class ResultUI {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly meta: HTMLElement;
  private readonly shareButton: HTMLButtonElement;
  private readonly againButton: HTMLButtonElement;

  constructor(
    private readonly onRaceAgain: () => void,
    private readonly onShare: (url: string) => void,
  ) {
    this.root = requireElement('result');
    this.list = requireElement('result-list');
    this.meta = requireElement('result-meta');
    this.shareButton = requireElement<HTMLButtonElement>('result-share');
    this.againButton = requireElement<HTMLButtonElement>('result-again');

    this.againButton.addEventListener('click', () => this.onRaceAgain());
  }

  show(result: RaceResult, roster: readonly Participant[]): void {
    const byId = new Map(roster.map((participant) => [participant.id, participant]));

    this.list.replaceChildren(
      ...result.records.map((record, index) => {
        const participant = byId.get(record.id);
        const row = document.createElement('li');
        row.className = `rank-${record.rank}`;
        // Cap the stagger so a 100-player result doesn't take a minute to read out.
        row.style.animationDelay = `${Math.min(index, 12) * 0.06}s`;

        const medal = document.createElement('span');
        medal.className = 'result__medal';
        medal.textContent = MEDALS[record.rank - 1] ?? `${record.rank}.`;

        const dot = document.createElement('span');
        dot.className = 'result__dot';
        dot.style.background = participant?.color ?? '#fff';
        dot.style.color = participant?.color ?? '#fff';

        const name = document.createElement('span');
        name.className = 'result__name';
        name.textContent = participant?.name ?? record.id;

        const time = document.createElement('span');
        time.className = 'result__time';
        time.textContent = record.dnf ? 'DNF' : formatDuration(record.time ?? 0);

        row.append(medal, dot, name, time);
        return row;
      }),
    );

    const shareUrl = `${location.origin}${location.pathname}?${toShareParams(
      result.seed,
      result.playerCount,
    )}`;

    this.meta.textContent = `SEED ${result.seed} · ${result.playerCount} PLAYERS · ${formatDuration(
      result.duration,
    )}`;

    this.shareButton.onclick = () => this.onShare(shareUrl);
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  get isVisible(): boolean {
    return !this.root.hidden;
  }
}
