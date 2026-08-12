import * as pc from 'playcanvas';
import type { MarbleManager } from '../marble/MarbleManager';
import type { Track } from '../track/Track';
import { clamp, damp, DEG_TO_RAD, inverseLerp, lerp } from '../util/math';
import { SCENE_COLORS, hexToRgb } from '../visual/Palette';

export enum CameraMode {
  /** Frames the start line and the track ahead. Used in READY and COUNTDOWN. */
  OVERVIEW = 'OVERVIEW',
  /** Follows the pack down the board. */
  RACE = 'RACE',
  /** Tight on the finish line for the closing moments. */
  FINISH = 'FINISH',
  /** Slow drift across the catcher during the result screen. */
  RESULT = 'RESULT',
}

interface Shot {
  /** Camera position, board-local. */
  offset: pc.Vec3;
  /** Point the camera looks at, board-local. */
  target: pc.Vec3;
  fov: number;
  /** Fraction of remaining distance left after one second — lower is snappier. */
  smoothing: number;
}

/**
 * The spectator camera (PRD §13, §14).
 *
 * Every shot is expressed in board-local space and converted to world, so the
 * framing stays correct however the board is tilted. Transitions use
 * exponential damping rather than fixed-duration tweens, so a mode change can
 * interrupt another at any moment without a visible snap.
 */
export class CameraManager {
  readonly entity: pc.Entity;

  private mode = CameraMode.OVERVIEW;
  private readonly position = new pc.Vec3();
  private readonly lookAt = new pc.Vec3();
  private fov = 62;

  private readonly desiredPosition = new pc.Vec3();
  private readonly desiredLookAt = new pc.Vec3();
  private readonly scratchA = new pc.Vec3();
  private readonly scratchB = new pc.Vec3();
  private readonly scratchC = new pc.Vec3();

  private shakeAmount = 0;
  private shakeTime = 0;
  private readonly shakeOffset = new pc.Vec3();

  private followY = 0;
  private resultTime = 0;

  /** Frames the start line and the run ahead of it. */
  private readonly overviewShot: Shot;

  constructor(
    private readonly track: Track,
    private readonly marbles: MarbleManager,
    private readonly boardLength: number,
    private readonly startY: number,
  ) {
    // Derived from the start line rather than hardcoded: the opening shot has
    // to show the marbles on the grid, and it should keep doing so if the board
    // is retuned.
    this.overviewShot = {
      offset: new pc.Vec3(0, startY + 5, 21),
      target: new pc.Vec3(0, startY - 7, 0),
      fov: 54,
      smoothing: 0.002,
    };

    this.entity = new pc.Entity('camera');
    this.entity.addComponent('camera', {
      // Alpha 0: the canvas is transparent so the page's CSS gradient backdrop
      // shows through around the board. Clearing to an opaque colour would
      // paint flat black over it and waste the depth it provides.
      clearColor: new pc.Color(...hexToRgb(SCENE_COLORS.background), 0),
      fov: this.fov,
      nearClip: 0.3,
      farClip: 1200,
      toneMapping: pc.TONEMAP_ACES,
      gammaCorrection: pc.GAMMA_SRGB,
    });
  }

  /**
   * Jumps straight to the current mode's shot with no interpolation.
   * Called once the scene graph is assembled and again on reset, so a new race
   * doesn't open with the camera flying in from wherever the last one ended.
   */
  snap(): void {
    const shot = this.resolveShot(0);
    this.track.localToWorld(shot.offset.x, shot.offset.y, shot.offset.z, this.position);
    this.track.localToWorld(shot.target.x, shot.target.y, shot.target.z, this.lookAt);
    this.fov = shot.fov;
    const camera = this.entity.camera;
    if (camera) camera.fov = this.fov;
    this.applyTransform();
  }

  setMode(mode: CameraMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode === CameraMode.RESULT) this.resultTime = 0;
  }

  getMode(): CameraMode {
    return this.mode;
  }

  /** Adds a decaying positional shake, e.g. on a hard hit or a finish. */
  shake(amount: number): void {
    this.shakeAmount = Math.min(1.2, this.shakeAmount + amount);
  }

  /**
   * Advances the camera on the render frame, not the physics step: camera
   * motion must never feed back into the simulation.
   */
  update(dt: number): void {
    const shot = this.resolveShot(dt);

    this.track.localToWorld(shot.offset.x, shot.offset.y, shot.offset.z, this.desiredPosition);
    this.track.localToWorld(shot.target.x, shot.target.y, shot.target.z, this.desiredLookAt);

    this.position.x = damp(this.position.x, this.desiredPosition.x, shot.smoothing, dt);
    this.position.y = damp(this.position.y, this.desiredPosition.y, shot.smoothing, dt);
    this.position.z = damp(this.position.z, this.desiredPosition.z, shot.smoothing, dt);

    this.lookAt.x = damp(this.lookAt.x, this.desiredLookAt.x, shot.smoothing, dt);
    this.lookAt.y = damp(this.lookAt.y, this.desiredLookAt.y, shot.smoothing, dt);
    this.lookAt.z = damp(this.lookAt.z, this.desiredLookAt.z, shot.smoothing, dt);

    this.fov = damp(this.fov, shot.fov, 0.002, dt);
    const camera = this.entity.camera;
    if (camera) camera.fov = this.fov;

    this.updateShake(dt);
    this.applyTransform();
  }

  /**
   * The shot actually used this frame: the current mode, scaled by zoom, then
   * blended toward the flat whole-board view as the zoom approaches its limit.
   */
  private resolveShot(dt: number): Shot {
    const shot = this.shotFor(this.mode, dt);
    const zoomed = this.zoomedOffset(shot);

    this.resolved.offset.copy(zoomed);
    this.resolved.target.copy(shot.target);
    this.resolved.fov = shot.fov;
    this.resolved.smoothing = shot.smoothing;

    const flat = this.flatness;
    if (flat <= 0.001) return this.resolved;

    const target = this.flatShot(this.flatScratch);
    this.resolved.offset.lerp(this.resolved.offset, target.offset, flat);
    this.resolved.target.lerp(this.resolved.target, target.target, flat);
    this.resolved.fov = lerp(this.resolved.fov, target.fov, flat);
    // Ease the damping too, so a long pull-back doesn't crawl.
    this.resolved.smoothing = lerp(this.resolved.smoothing, target.smoothing, flat);
    return this.resolved;
  }

  private readonly resolved: Shot = {
    offset: new pc.Vec3(),
    target: new pc.Vec3(),
    fov: 54,
    smoothing: 0.002,
  };
  private readonly flatScratch: Shot = {
    offset: new pc.Vec3(),
    target: new pc.Vec3(),
    fov: 30,
    smoothing: 0.004,
  };

  /**
   * The shot's camera position after zoom, in board-local space.
   *
   * Zoom scales the camera's displacement from whatever it is looking at, so
   * the subject stays centred at every zoom level and each mode keeps its own
   * framing intent.
   */
  private zoomedOffset(shot: Shot): pc.Vec3 {
    return this.zoomScratch
      .copy(shot.offset)
      .sub(shot.target)
      .mulScalar(this.zoom)
      .add(shot.target);
  }

  private readonly zoomScratch = new pc.Vec3();

  private updateShake(dt: number): void {
    if (this.shakeAmount <= 0.0001) {
      this.shakeOffset.set(0, 0, 0);
      return;
    }
    this.shakeTime += dt;
    // Deterministic wobble: summed sines rather than noise, so a replay of the
    // same race looks identical to the original run.
    const t = this.shakeTime * 46;
    this.shakeOffset.set(
      Math.sin(t) * this.shakeAmount,
      Math.sin(t * 1.37 + 1.1) * this.shakeAmount,
      Math.sin(t * 0.83 + 2.4) * this.shakeAmount * 0.4,
    );
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 2.4);
  }

  private applyTransform(): void {
    this.scratchC.copy(this.position).add(this.shakeOffset);
    this.entity.setPosition(this.scratchC);
    this.entity.lookAt(this.lookAt);
  }

  private shotFor(mode: CameraMode, dt: number): Shot {
    switch (mode) {
      case CameraMode.OVERVIEW:
        return this.overviewShot;
      case CameraMode.RACE:
        return this.raceShot();
      case CameraMode.FINISH:
        return this.finishShot();
      case CameraMode.RESULT:
        return this.resultShot(dt);
      default: {
        const exhaustive: never = mode;
        throw new Error(`Unhandled camera mode: ${String(exhaustive)}`);
      }
    }
  }

  /**
   * Trails the pack. The camera follows the centroid but is biased toward the
   * leader, so the marble that matters stays in frame while the chasing pack
   * remains visible.
   */
  private raceShot(): Shot {
    this.marbles.activeCentroid(this.scratchA);
    const centroidY = this.track.worldToLocal(this.scratchA, this.scratchB).y;

    this.marbles.leaderPosition(this.scratchA);
    const leaderY = this.track.worldToLocal(this.scratchA, this.scratchB).y;

    // Never let the camera drift back up the board: a race camera that
    // reverses reads as a mistake even when the pack genuinely spreads out.
    const focusY = centroidY * 0.45 + leaderY * 0.55;
    this.followY = Math.min(this.followY, focusY);

    return {
      offset: new pc.Vec3(0, this.followY + 7, 20),
      target: new pc.Vec3(0, this.followY - 5, 0),
      fov: 58,
      smoothing: 0.0004,
    };
  }

  /** Low and close on the line, so photo finishes are actually readable. */
  private finishShot(): Shot {
    const finishY = -this.boardLength + 4;
    return {
      offset: new pc.Vec3(0, finishY + 7, 15),
      target: new pc.Vec3(0, finishY - 2, 0),
      fov: 48,
      smoothing: 0.0006,
    };
  }

  /** Slow drift over the catcher while the ranking is revealed. */
  private resultShot(dt: number): Shot {
    this.resultTime += dt;
    const finishY = -this.boardLength;
    const swing = Math.sin(this.resultTime * 0.35) * 6;
    return {
      offset: new pc.Vec3(swing, finishY + 6, 18),
      target: new pc.Vec3(0, finishY - 2, 0),
      fov: 52,
      smoothing: 0.002,
    };
  }

  /**
   * The fully zoomed-out view: dead flat, whole board, no perspective to speak
   * of.
   *
   * The camera sits directly on the board's normal axis looking straight at its
   * face, so the tilt reads as zero and the track becomes a flat 2D diagram.
   * The field of view is deliberately narrow and the distance correspondingly
   * large — that combination is what removes the perspective convergence, and
   * it is why the whole 190-unit run can be legible at once instead of
   * vanishing to a point.
   */
  private flatShot(out: Shot): Shot {
    const midY = (this.startY - this.boardLength) / 2;
    // A margin so the run isn't flush against the top and bottom of the screen.
    const halfRun = ((this.startY + this.boardLength) / 2) * 1.12;

    out.target.set(0, midY, 0);
    out.offset.set(0, midY, halfRun / Math.tan((CameraManager.FLAT_FOV / 2) * DEG_TO_RAD));
    out.fov = CameraManager.FLAT_FOV;
    out.smoothing = 0.004;
    return out;
  }

  /**
   * How flat the view currently is, 0 (normal 3D framing) to 1 (2D board).
   *
   * Ramped over the outer part of the zoom range rather than switched, so
   * scrolling out tips the board smoothly into plan view instead of snapping.
   */
  private get flatness(): number {
    const t = inverseLerp(CameraManager.FLATTEN_FROM, CameraManager.MAX_ZOOM, this.zoom);
    return t * t * (3 - 2 * t); // smoothstep
  }

  /**
   * Multiplies camera distance. 1 is the designed framing; smaller is closer.
   * Applied to every mode, so the player can zoom during a race too.
   */
  setZoom(zoom: number): void {
    this.zoom = clamp(zoom, CameraManager.MIN_ZOOM, CameraManager.MAX_ZOOM);
  }

  getZoom(): number {
    return this.zoom;
  }

  /** Nudges the zoom by a wheel notch. Returns the new value. */
  nudgeZoom(delta: number): number {
    this.setZoom(this.zoom * (1 + delta));
    return this.zoom;
  }

  private zoom = 1;
  private static readonly MIN_ZOOM = 0.45;
  /** Fully zoomed out: the flat 2D whole-board view. */
  private static readonly MAX_ZOOM = 4;
  /** Zoom level at which the board starts tipping toward plan view. */
  private static readonly FLATTEN_FROM = 1.8;
  /** Narrow FOV at full zoom-out — this is what kills the perspective. */
  private static readonly FLAT_FOV = 26;

  /** True once the view has flattened enough to read as a 2D board. */
  get isFlattened(): boolean {
    return this.flatness > 0.5;
  }

  /** How flat the view is, 0..1. Drives fog range so distant geometry stays visible. */
  get flatAmount(): number {
    return this.flatness;
  }

  /** Snaps to either extreme of the zoom range. */
  setZoomExtreme(out: boolean): void {
    this.setZoom(out ? CameraManager.MAX_ZOOM : 1);
  }

  /** Clears follow state between races. */
  reset(): void {
    this.followY = 0;
    this.resultTime = 0;
    this.shakeAmount = 0;
    this.mode = CameraMode.OVERVIEW;
  }
}

