import { DEFAULT_NAMES } from '../marble/MarbleConfig';
import { marbleColor } from '../visual/Palette';
import { requireElement } from './dom';

interface Entry {
  name: string;
  checked: boolean;
}

/**
 * Start-screen entrant list: every name from the default roster, checked by
 * default, with anyone not racing simply unticked.
 *
 * The swatch beside each name is the colour that entrant's marble will be, so
 * the list doubles as the key for the race — which matters because the roster
 * contains a duplicate name, and colour is what tells those two apart.
 *
 * Entries are held as objects rather than being read back out of the DOM, so
 * shuffling reorders people while their tick state travels with them. Reading
 * checkbox state by index would silently reassign who is racing.
 */
export class RosterUI {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly count: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly shuffleButton: HTMLButtonElement;
  private entries: Entry[];

  constructor(
    names: readonly string[] = DEFAULT_NAMES,
    private readonly onChange?: (selected: string[]) => void,
  ) {
    this.root = requireElement('roster');
    this.list = requireElement('roster-list');
    this.count = requireElement('roster-count');
    this.toggle = requireElement<HTMLButtonElement>('roster-toggle');
    this.shuffleButton = requireElement<HTMLButtonElement>('roster-shuffle');

    this.entries = names.map((name) => ({ name, checked: true }));

    this.toggle.addEventListener('click', () => this.toggleAll());
    this.shuffleButton.addEventListener('click', () => this.shuffle());
    this.build();
  }

  private build(): void {
    const items = this.entries.map((entry, index) => {
      const label = document.createElement('label');
      label.className = 'roster__item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = entry.checked;
      checkbox.addEventListener('change', () => {
        entry.checked = checkbox.checked;
        this.refresh();
      });

      const swatch = document.createElement('span');
      swatch.className = 'roster__swatch';
      swatch.style.background = marbleColor(index);
      swatch.style.color = marbleColor(index);

      const text = document.createElement('span');
      text.textContent = entry.name;

      label.append(checkbox, swatch, text);
      return label;
    });

    this.list.replaceChildren(...items);
    this.refresh();
  }

  /**
   * Randomises the running order.
   *
   * Starting slot and marble colour both follow roster position, so this
   * genuinely changes the race rather than just the list: the same seed with a
   * different order is a different race, which is the point of the button.
   */
  shuffle(): void {
    // Fisher-Yates. Deliberately not from the seeded stream: this is a UI
    // action taken before a race, not part of the simulation, and folding it
    // into the seeded sequence would make the seed depend on how many times
    // someone pressed a button.
    for (let i = this.entries.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.entries[i], this.entries[j]] = [this.entries[j], this.entries[i]];
    }
    this.build();
  }

  /** Names currently ticked, in display order. */
  get selected(): string[] {
    return this.entries.filter((entry) => entry.checked).map((entry) => entry.name);
  }

  private refresh(): void {
    const total = this.selected.length;
    this.count.textContent = `${total}명 참가`;
    // Two marbles is the minimum that constitutes a race.
    this.count.style.color = total < 2 ? 'var(--accent-2)' : '';
    this.toggle.textContent = total === this.entries.length ? '전체 해제' : '전체 선택';
    this.onChange?.(this.selected);
  }

  private toggleAll(): void {
    const enableAll = this.selected.length < this.entries.length;
    for (const entry of this.entries) entry.checked = enableAll;
    this.build();
  }

  /**
   * Re-selects exactly `count` entrants from the top of the list. Used when a
   * field size arrives from a URL parameter rather than from the checkboxes.
   */
  selectFirst(count: number): void {
    this.entries.forEach((entry, index) => {
      entry.checked = index < count;
    });
    this.build();
  }

  show(): void {
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
