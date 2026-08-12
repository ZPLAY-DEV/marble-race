import * as pc from 'playcanvas';
import type { Marble } from '../marble/Marble';
import { requireElement } from './dom';

/**
 * Player-number badges tracking each marble (PRD §16).
 *
 * These are HTML nodes projected to screen space rather than 3D text: no font
 * assets, crisp at any resolution, and they cost nothing in the render loop.
 *
 * Labels are hidden above a threshold — 100 overlapping badges obscure the
 * race they are meant to explain (PRD §14).
 */
export class MarbleLabels {
  private readonly layer: HTMLElement;
  private readonly badges = new Map<string, HTMLElement>();
  private readonly projected = new pc.Vec3();
  private active = false;

  /** Above this player count the badges are suppressed. */
  private static readonly MAX_LABELS = 24;

  constructor() {
    this.layer = requireElement('marker-layer');
  }

  build(marbles: readonly Marble[]): void {
    this.clear();
    this.active = marbles.length <= MarbleLabels.MAX_LABELS;
    if (!this.active) return;

    const badges = marbles.map((marble) => {
      const badge = document.createElement('div');
      badge.className = 'marker';
      // The entrant's name, not their number — the roster is people, and a
      // name is what makes a reversal worth reacting to.
      badge.textContent = marble.participant.name;
      badge.style.background = marble.participant.color;
      this.badges.set(marble.id, badge);
      return badge;
    });

    this.layer.replaceChildren(...badges);
  }

  /** Projects every marble to screen space. Called once per rendered frame. */
  update(marbles: readonly Marble[], camera: pc.CameraComponent): void {
    if (!this.active) return;

    for (const marble of marbles) {
      const badge = this.badges.get(marble.id);
      if (!badge) continue;

      camera.worldToScreen(marble.position, this.projected);

      // z < 0 means the marble is behind the camera, where worldToScreen's
      // result is mirrored nonsense.
      const visible =
        this.projected.z > 0 &&
        this.projected.x > -60 &&
        this.projected.y > -60 &&
        this.projected.x < window.innerWidth + 60 &&
        this.projected.y < window.innerHeight + 60;

      if (!visible) {
        badge.style.display = 'none';
        continue;
      }

      badge.style.display = '';
      badge.style.transform = `translate(-50%, -50%) translate(${this.projected.x}px, ${
        this.projected.y - 22
      }px)`;
    }
  }

  clear(): void {
    this.badges.clear();
    this.layer.replaceChildren();
  }

  hide(): void {
    this.layer.style.display = 'none';
  }

  show(): void {
    this.layer.style.display = '';
  }
}
