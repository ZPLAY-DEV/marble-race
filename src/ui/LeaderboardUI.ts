import type { Marble } from '../marble/Marble';
import { requireElement } from './dom';

/**
 * Live standings panel.
 *
 * Built as a fixed set of *slots* rather than a row per marble. Slot 0 always
 * shows whoever is currently leading, so a large field shows the actual top of
 * the race rather than an arbitrary subset — and the DOM is created once, so
 * updating at 60 Hz costs a handful of text writes instead of a rebuild.
 */
export class LeaderboardUI {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly slots: Array<{
    row: HTMLElement;
    rank: HTMLElement;
    dot: HTMLElement;
    name: HTMLElement;
  }> = [];

  /** Beyond this the panel is unreadable, so only the leaders are shown. */
  private static readonly MAX_ROWS = 12;

  constructor() {
    this.root = requireElement('leaderboard');
    this.list = requireElement('leaderboard-list');
  }

  build(marbleCount: number): void {
    this.slots.length = 0;
    const visible = Math.min(marbleCount, LeaderboardUI.MAX_ROWS);

    const rows = Array.from({ length: visible }, (_, index) => {
      const row = document.createElement('li');

      const rank = document.createElement('span');
      rank.className = 'leaderboard__rank';
      rank.textContent = String(index + 1);

      const dot = document.createElement('span');
      dot.className = 'leaderboard__dot';

      const name = document.createElement('span');

      row.append(rank, dot, name);
      this.slots.push({ row, rank, dot, name });
      return row;
    });

    this.list.replaceChildren(...rows);
    this.setHeading(marbleCount, visible);
  }

  /** `standings` must be ordered best-first. */
  update(standings: readonly Marble[]): void {
    this.slots.forEach((slot, index) => {
      const marble = standings[index];
      if (!marble) {
        slot.row.hidden = true;
        return;
      }

      slot.row.hidden = false;
      slot.rank.textContent = String(index + 1);
      slot.name.textContent = marble.participant.name;
      slot.dot.style.background = marble.participant.color;
      slot.dot.style.color = marble.participant.color;
      slot.row.classList.toggle('is-leader', index === 0);
      slot.row.classList.toggle('is-done', marble.finished);
    });
  }

  private setHeading(total: number, visible: number): void {
    const heading = this.root.querySelector('.leaderboard__head');
    if (heading) heading.textContent = visible < total ? `LIVE · TOP ${visible}` : 'LIVE';
  }

  show(): void {
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
