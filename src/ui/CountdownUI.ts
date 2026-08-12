import { requireElement } from './dom';

/**
 * The "3 / 2 / 1 / GO!" overlay (PRD §12).
 *
 * Each beat replaces the element rather than mutating its text, because
 * restarting a CSS animation on a live node requires a reflow hack; swapping
 * the node is both simpler and reliable.
 */
export class CountdownUI {
  private readonly root: HTMLElement;

  constructor() {
    this.root = requireElement('countdown');
  }

  /** `value` counts down 3, 2, 1; 0 means GO. */
  show(value: number): void {
    const label = value <= 0 ? 'GO!' : String(value);
    this.root.hidden = false;
    this.root.classList.toggle('countdown--go', value <= 0);
    this.root.replaceChildren(Object.assign(document.createElement('span'), { textContent: label }));

    // The pop animation ends at opacity 0; hide the layer once it's done so it
    // never intercepts anything.
    window.setTimeout(() => {
      if (this.root.textContent === label) this.root.hidden = true;
    }, 900);
  }

  hide(): void {
    this.root.hidden = true;
    this.root.replaceChildren();
  }
}
